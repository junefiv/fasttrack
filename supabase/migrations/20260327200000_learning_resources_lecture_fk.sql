-- learning_resources: 회차(lecture_session_id) 대신 강좌(lectures.id)에 FK 연결
-- 기존에 등록된 행은 모두 지정 강좌로 묶음

DO $$
BEGIN
  IF to_regclass('public.learning_resources') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.learning_resources
    ADD COLUMN IF NOT EXISTS lecture_id uuid REFERENCES public.lectures(id) ON DELETE CASCADE;

  UPDATE public.learning_resources
  SET lecture_id = '247d17db-dd92-4aa3-95ff-44abfaf56782'::uuid;

  ALTER TABLE public.learning_resources
    DROP COLUMN IF EXISTS lecture_session_id;

  ALTER TABLE public.learning_resources
    ALTER COLUMN lecture_id SET NOT NULL;

  CREATE INDEX IF NOT EXISTS learning_resources_lecture_id_idx
    ON public.learning_resources (lecture_id);
END $$;
