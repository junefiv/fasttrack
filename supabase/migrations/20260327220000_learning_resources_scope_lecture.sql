-- PDF 교재를 회차가 아니라 강좌(lectures.id) 단위로 연결
-- 적용 후 같은 강좌의 모든 회차에서 동일 교재 조회 가능

ALTER TABLE public.learning_resources
  ADD COLUMN IF NOT EXISTS lecture_id uuid REFERENCES public.lectures(id) ON DELETE CASCADE;

-- 기존: lecture_session_id 만 있는 행 → 해당 회차의 lecture_id 로 승격 후 회차 FK 해제
UPDATE public.learning_resources lr
SET lecture_id = ls.lecture_id,
    lecture_session_id = NULL
FROM public.lecture_sessions ls
WHERE lr.lecture_session_id = ls.id
  AND lr.lecture_id IS NULL;

CREATE INDEX IF NOT EXISTS learning_resources_lecture_id_idx
  ON public.learning_resources (lecture_id);
