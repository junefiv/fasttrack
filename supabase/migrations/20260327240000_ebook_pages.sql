-- ebook_pages: learning_resources.pdf_url 기준 PDF 텍스트를 페이지별로 저장
-- 자동 추출: Supabase Database Webhook → Edge Function `extract-ebook-pages` 연결
--   (Dashboard → Database → Webhooks → INSERT/UPDATE public.learning_resources)
--   HTTP Header 예: x-ebook-secret: <Secrets에 등록한 EBOOK_EXTRACTION_SECRET과 동일 값>

CREATE TABLE IF NOT EXISTS public.ebook_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_resource_id uuid NOT NULL REFERENCES public.learning_resources (id) ON DELETE CASCADE,
  page_number int NOT NULL CHECK (page_number >= 1),
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learning_resource_id, page_number)
);

CREATE INDEX IF NOT EXISTS ebook_pages_learning_resource_id_idx
  ON public.ebook_pages (learning_resource_id);

ALTER TABLE public.learning_resources
  ADD COLUMN IF NOT EXISTS ebook_text_extracted_at timestamptz,
  ADD COLUMN IF NOT EXISTS ebook_text_extract_error text;

ALTER TABLE public.ebook_pages DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ebook_pages IS 'PDF(pdf_url)에서 추출한 페이지별 텍스트; Edge Function이 채움';
