-- 동방학지 196호 PDF 교재 1건 등록 + ebook_pages 48페이지 플레이스홀더
-- (실제 PDF 텍스트로 바꾸려면 Edge Function extract-ebook-pages 배포 후
--  EBOOK_PAGES_SCHEMA=production, EBOOK_DEFAULT_LECTURE_SESSION_ID 설정하고 트리거/수동 호출)
--
-- 전제: lecture_id, lecture_session_id FK 대상 행이 이미 존재해야 합니다.

BEGIN;

INSERT INTO public.learning_resources (
  id,
  resource_type,
  title,
  pdf_url,
  created_at,
  updated_at,
  lecture_id
)
VALUES (
  '33261c64-b6d6-43f9-81f4-13498a56c8e6',
  'ebook',
  '국민 탄생의 역사와 안중근 이태준 동방학지 196호',
  'https://historykorea.org/wp-content/uploads/2021/12/%EA%B5%AD%EB%AF%BC-%ED%83%84%EC%83%9D%EC%9D%98-%EC%97%AD%EC%82%AC%EC%99%80-%EC%95%88%EC%A4%91%EA%B7%BC-%EC%9D%B4%ED%83%9C%EC%A7%84-%EB%8F%99%EB%B0%A9%ED%95%99%EC%A7%80-196%ED%98%B8.pdf',
  now(),
  now(),
  '247d17db-dd92-4aa3-95ff-44abfaf56782'
)
ON CONFLICT (id) DO UPDATE SET
  resource_type = EXCLUDED.resource_type,
  title = EXCLUDED.title,
  pdf_url = EXCLUDED.pdf_url,
  lecture_id = EXCLUDED.lecture_id,
  updated_at = now();

DELETE FROM public.ebook_pages
WHERE resource_id = '33261c64-b6d6-43f9-81f4-13498a56c8e6';

INSERT INTO public.ebook_pages (
  resource_id,
  lecture_session_id,
  page_number,
  extracted_text,
  page_image_url,
  created_at,
  updated_at
)
SELECT
  '33261c64-b6d6-43f9-81f4-13498a56c8e6'::uuid,
  '0296be33-1714-4ea7-bdb7-1cc69f5b22ed'::uuid,
  n,
  format('페이지 %s 내용 (실제 PDF 텍스트 추출 예정)', n),
  NULL,
  now(),
  now()
FROM generate_series(1, 48) AS n;

COMMIT;
