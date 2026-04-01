-- 복습 매핑은 fasttrack_mock_exam_catalog_problems.ebook_page_id / lecture_caption_id 만 사용합니다.
-- 과거 마이그레이션으로 fasttrack_catalog_problem_learning_links 가 생겼다면 제거합니다.
DROP TABLE IF EXISTS public.fasttrack_catalog_problem_learning_links CASCADE;

DROP FUNCTION IF EXISTS public.trg_validate_catalog_problem_learning_link();
