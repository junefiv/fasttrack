-- learning_resources 에 lecture_id 가 없을 때(앱에서 "column does not exist" 시) 적용
-- supabase db push 또는 Dashboard → SQL Editor 에서 실행

ALTER TABLE public.learning_resources
  ADD COLUMN IF NOT EXISTS lecture_id uuid;

UPDATE public.learning_resources
SET lecture_id = '247d17db-dd92-4aa3-95ff-44abfaf56782'::uuid
WHERE lecture_id IS NULL;

ALTER TABLE public.learning_resources
  ALTER COLUMN lecture_id SET NOT NULL;

ALTER TABLE public.learning_resources
  DROP CONSTRAINT IF EXISTS learning_resources_lecture_id_fkey;

ALTER TABLE public.learning_resources
  ADD CONSTRAINT learning_resources_lecture_id_fkey
  FOREIGN KEY (lecture_id) REFERENCES public.lectures(id) ON DELETE CASCADE;

ALTER TABLE public.learning_resources
  DROP COLUMN IF EXISTS lecture_session_id;

CREATE INDEX IF NOT EXISTS learning_resources_lecture_id_idx
  ON public.learning_resources (lecture_id);
