-- PDF 교재 Storage: Edge Function(extract-ebook-pages)이 pdf_url로 GET 할 수 있도록 public 버킷
-- 웹 업로드 페이지(anon)가 업로드할 수 있게 INSERT 정책 포함 — 운영 전 권한·라우트 노출 여부 검토 권장

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ebook-pdfs',
  'ebook-pdfs',
  true,
  52428800,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "ebook_pdfs_select" ON storage.objects;
CREATE POLICY "ebook_pdfs_select"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'ebook-pdfs');

DROP POLICY IF EXISTS "ebook_pdfs_insert_anon" ON storage.objects;
CREATE POLICY "ebook_pdfs_insert_anon"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'ebook-pdfs');

DROP POLICY IF EXISTS "ebook_pdfs_insert_authenticated" ON storage.objects;
CREATE POLICY "ebook_pdfs_insert_authenticated"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'ebook-pdfs');
