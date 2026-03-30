/*
  =============================================================================
  교재 PDF → 페이지별 텍스트 (ebook_pages) 자동 추출 — 운영 체크리스트
  =============================================================================

  흐름
  ----
  1) learning_resources 에 행이 생기거나 pdf_url 이 바뀌면
     트리거 trg_learning_resources_ebook_extract → pg_net HTTP POST
  2) Edge Function extract-ebook-pages 가 pdf_url 에서 PDF 를 받아 unpdf 로 텍스트 추출
  3) 해당 learning_resource_id 의 ebook_pages 를 비우고 페이지별 body 로 다시 insert
  4) 성공 시 learning_resources.ebook_text_extracted_at 갱신, 실패 시 ebook_text_extract_error

  사전 준비 (프로젝트당 1회)
  -------------------------
  - supabase functions deploy extract-ebook-pages
  - Edge Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  - 선택: EBOOK_EXTRACTION_SECRET 설정 시 요청 헤더 x-ebook-secret 동일 값 필요
  - Vault (SQL Editor, 값은 본인 프로젝트로 교체):

    SELECT vault.create_secret(
      '<SERVICE_ROLE_JWT>',
      'ebook_extract_service_role',
      'extract-ebook-pages 호출용'
    );
    SELECT vault.create_secret(
      'https://<PROJECT_REF>.supabase.co/functions/v1/extract-ebook-pages',
      'ebook_extract_url',
      'Edge Function 전체 URL'
    );
    -- Edge 에 EBOOK_EXTRACTION_SECRET 을 켠 경우:
    -- SELECT vault.create_secret('<동일문자열>', 'ebook_extraction_secret', 'x-ebook-secret');

  - Storage: 마이그레이션 20260327260000_storage_ebook_pdfs_bucket.sql 적용 (버킷 ebook-pdfs, public 읽기)
  - pdf_url 은 Edge 런타임에서 GET 가능해야 함 (공개 URL 또는 장기 유효 서명 URL)

  교재 등록 방법
  -------------
  A) 웹: VITE_ENABLE_EBOOK_UPLOAD=true 일 때 /ebook/upload 에서 강좌 선택 후 PDF 업로드
     → Storage 공개 URL 로 learning_resources INSERT → 트리거가 추출 실행

  B) SQL/대시보드: register_learning_resource_example.sql 참고해 INSERT
     (외부 URL 이면 Storage 없이 가능)

  검증 쿼리 (실행 후 몇 초~분 뒤)
  --------------------------------
*/

-- 최근 등록된 교재의 추출 메타
-- SELECT id, lecture_id, title, pdf_url, ebook_text_extracted_at, ebook_text_extract_error
-- FROM public.learning_resources
-- ORDER BY id DESC
-- LIMIT 5;

-- 특정 교재의 페이지 수
-- SELECT learning_resource_id, COUNT(*) AS pages, MAX(length(body)) AS max_body_len
-- FROM public.ebook_pages
-- WHERE learning_resource_id = '<uuid>'
-- GROUP BY learning_resource_id;

-- Vault 시크릿 이름만 존재 확인 (값은 출력되지 않음)
-- SELECT name FROM vault.secrets WHERE name LIKE 'ebook_%' ORDER BY name;
