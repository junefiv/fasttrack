-- 카탈로그 문항 행에 복습용 교재 페이지·자막 ID (앱: fetchCatalogProblemLearningLinks)
ALTER TABLE public.fasttrack_mock_exam_catalog_problems
  ADD COLUMN IF NOT EXISTS ebook_page_id uuid REFERENCES public.ebook_pages (id) ON DELETE SET NULL;

ALTER TABLE public.fasttrack_mock_exam_catalog_problems
  ADD COLUMN IF NOT EXISTS lecture_caption_id uuid REFERENCES public.lecture_captions (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fasttrack_mock_exam_catalog_problems.ebook_page_id IS
  '선택: 문항별 복습용 ebook_pages.id (lecture_captions와 동일 lecture_session 권장).';

COMMENT ON COLUMN public.fasttrack_mock_exam_catalog_problems.lecture_caption_id IS
  '선택: 문항별 복습용 lecture_captions.id.';
