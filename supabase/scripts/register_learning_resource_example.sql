-- 예시: 강좌에 PDF 교재 등록 (실행 후 트리거가 Edge Function을 호출해 ebook_pages 를 채움)
-- 전체 절차·검증 쿼리: ebook_extraction_runbook.sql
-- lecture_id·pdf_url·title 은 실제 값으로 바꾸세요.
-- resource_type 은 스키마상 NOT NULL 이며 PDF 교재는 보통 'ebook' 입니다.

-- INSERT INTO public.learning_resources (lecture_id, resource_type, pdf_url, title)
-- VALUES (
--   '00000000-0000-0000-0000-000000000000'::uuid,
--   'ebook',
--   'https://<project>.supabase.co/storage/v1/object/public/ebook-pdfs/<lecture_id>/file.pdf',
--   '교재 제목'
-- )
-- RETURNING id, lecture_id, pdf_url, title;

-- Vault 1회 설정 (값 교체 후 한 번만 실행)
/*
SELECT vault.create_secret(
  '<SERVICE_ROLE_JWT>',
  'ebook_extract_service_role',
  'extract-ebook-pages'
);
SELECT vault.create_secret(
  'https://<PROJECT_REF>.supabase.co/functions/v1/extract-ebook-pages',
  'ebook_extract_url',
  'Edge Function URL'
);
*/

INSERT INTO public.learning_resources (lecture_id, resource_type, pdf_url, title)
VALUES (
  'd2222222-2222-4222-8222-222222222202'::uuid,
  'ebook',
  'https://qkdybhpcafbqhqwfmcaa.supabase.co/storage/v1/object/public/ebook-pdfs/d2222222-2222-4222-8222-222222222202/image%20march%20math.pdf',
  '2026 3월 학평 수학'
)
RETURNING id, lecture_id, pdf_url, title;