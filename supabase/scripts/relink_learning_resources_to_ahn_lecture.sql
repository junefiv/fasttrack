-- 기존 learning_resources → 시드한 「안중근 역사강의」 강좌로 연결
-- 강좌 id: a2222222-2222-4222-8222-222222222202
-- (회차 1강 id: a3333333-3333-4333-8333-333333333303 — 앱은 lecture_id 로 교재 조회)

UPDATE public.learning_resources
SET lecture_id = 'a2222222-2222-4222-8222-222222222202'::uuid,
    updated_at = now()
WHERE id = '33261c64-b6d6-43f9-81f4-13498a56c8e6'::uuid;

-- ebook_pages 가 lecture_session_id 를 쓰는 스키마: 1강 회차로 정렬
UPDATE public.ebook_pages
SET lecture_session_id = 'a3333333-3333-4333-8333-333333333303'::uuid,
    updated_at = now()
WHERE resource_id = '33261c64-b6d6-43f9-81f4-13498a56c8e6'::uuid;

-- 다른 행이 있으면 전부 같은 강좌로 (필요 시 주석 해제)
-- UPDATE public.learning_resources
-- SET lecture_id = 'a2222222-2222-4222-8222-222222222202'::uuid, updated_at = now();

SELECT id, lecture_id, title FROM public.learning_resources;
SELECT lecture_session_id, COUNT(*) AS pages FROM public.ebook_pages WHERE resource_id = '33261c64-b6d6-43f9-81f4-13498a56c8e6'::uuid GROUP BY 1;
