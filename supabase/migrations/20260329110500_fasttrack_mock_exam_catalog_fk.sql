-- fasttrack_mock_exams 가 있을 때만 FK 추가 (없는 DB에서는 스킵)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'fasttrack_mock_exams'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'fasttrack_mock_exam_catalog'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fasttrack_mock_exam_catalog_linked_mock_exam_id_fkey'
  ) THEN
    ALTER TABLE public.fasttrack_mock_exam_catalog
      ADD CONSTRAINT fasttrack_mock_exam_catalog_linked_mock_exam_id_fkey
      FOREIGN KEY (linked_mock_exam_id)
      REFERENCES public.fasttrack_mock_exams (id)
      ON DELETE SET NULL;
  END IF;
END $$;
