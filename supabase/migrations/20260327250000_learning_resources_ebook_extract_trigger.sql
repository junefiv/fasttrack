-- learning_resources INSERT / pdf_url 변경 시 Edge Function `extract-ebook-pages` 를 비동기 호출 → ebook_pages 적재
--
-- 사전 준비 (SQL Editor에서 1회, 값은 본인 프로젝트로 교체):
--   1) Edge Function 배포: supabase functions deploy extract-ebook-pages
--   2) Vault 시크릿 (이름 고정):
--        SELECT vault.create_secret(
--          '<SERVICE_ROLE_JWT>',
--          'ebook_extract_service_role',
--          'extract-ebook-pages 호출용 (Dashboard → Settings → API → service_role)'
--        );
--        SELECT vault.create_secret(
--          'https://<PROJECT_REF>.supabase.co/functions/v1/extract-ebook-pages',
--          'ebook_extract_url',
--          'Edge Function 전체 URL'
--        );
--      선택: Edge에 EBOOK_EXTRACTION_SECRET 을 켠 경우 동일 값을
--        SELECT vault.create_secret('<동일문자열>', 'ebook_extraction_secret', 'x-ebook-secret');
--
-- 시크릿이 없으면 트리거는 INSERT/UPDATE 를 막지 않고, 로그만 남기고 HTTP 를 보내지 않습니다.
-- Database Webhook 으로 같은 함수를 이미 호출 중이면 중복이 되므로 트리거만 쓰거나 웹훅만 쓰세요.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trg_learning_resources_ebook_extract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  srv text;
  fn_url text;
  extra text;
  hdr jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.pdf_url IS NOT DISTINCT FROM NEW.pdf_url) THEN
    RETURN NEW;
  END IF;

  IF NEW.pdf_url IS NULL OR length(trim(NEW.pdf_url)) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT ds.decrypted_secret INTO srv
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'ebook_extract_service_role'
  LIMIT 1;

  SELECT ds.decrypted_secret INTO fn_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'ebook_extract_url'
  LIMIT 1;

  IF srv IS NULL OR fn_url IS NULL OR length(trim(srv)) = 0 OR length(trim(fn_url)) = 0 THEN
    RAISE LOG 'trg_learning_resources_ebook_extract: vault secrets ebook_extract_service_role / ebook_extract_url missing; skip HTTP';
    RETURN NEW;
  END IF;

  hdr := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', format('Bearer %s', trim(srv)),
    'apikey', trim(srv)
  );

  SELECT ds.decrypted_secret INTO extra
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'ebook_extraction_secret'
  LIMIT 1;

  IF extra IS NOT NULL AND length(trim(extra)) > 0 THEN
    hdr := hdr || jsonb_build_object('x-ebook-secret', trim(extra));
  END IF;

  PERFORM net.http_post(
    url := trim(fn_url),
    headers := hdr,
    body := jsonb_build_object('learning_resource_id', NEW.id::text),
    timeout_milliseconds := 120000
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_learning_resources_ebook_extract() IS
  'pg_net 으로 extract-ebook-pages Edge Function 호출; Vault 시크릿 ebook_extract_* 필요';

DROP TRIGGER IF EXISTS learning_resources_ebook_extract ON public.learning_resources;

CREATE TRIGGER learning_resources_ebook_extract
  AFTER INSERT OR UPDATE OF pdf_url ON public.learning_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_learning_resources_ebook_extract();
