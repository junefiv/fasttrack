-- 카탈로그 모의고사 문항별 사용자 제출 답안 (프로토타입 user_id = 클라이언트 UUID)
CREATE TABLE public.fasttrack_mock_exam_catalog_problem_exam_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  problem_id uuid NOT NULL REFERENCES public.fasttrack_mock_exam_catalog_problems (problem_id) ON DELETE CASCADE,
  user_answer smallint NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fasttrack_mock_exam_catalog_problem_exam_results IS
  '카탈로그 문항(fasttrack_mock_exam_catalog_problems)에 대한 사용자 정답 제출. is_correct는 해당 문항의 answer와 user_answer 일치 여부.';

CREATE INDEX fasttrack_catalog_problem_exam_results_user_problem_idx
  ON public.fasttrack_mock_exam_catalog_problem_exam_results (user_id, problem_id);

CREATE INDEX fasttrack_catalog_problem_exam_results_problem_idx
  ON public.fasttrack_mock_exam_catalog_problem_exam_results (problem_id);

CREATE OR REPLACE FUNCTION public.trg_set_catalog_problem_exam_result_is_correct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected smallint;
BEGIN
  SELECT p.answer INTO expected
  FROM public.fasttrack_mock_exam_catalog_problems p
  WHERE p.problem_id = NEW.problem_id;

  IF expected IS NULL THEN
    RAISE EXCEPTION 'fasttrack_mock_exam_catalog_problems.problem_id % not found', NEW.problem_id;
  END IF;

  NEW.is_correct := (NEW.user_answer = expected);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_catalog_problem_exam_results_is_correct
  BEFORE INSERT OR UPDATE OF user_answer, problem_id
  ON public.fasttrack_mock_exam_catalog_problem_exam_results
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_catalog_problem_exam_result_is_correct();

ALTER TABLE public.fasttrack_mock_exam_catalog_problem_exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fasttrack_catalog_problem_exam_results_all_proto"
  ON public.fasttrack_mock_exam_catalog_problem_exam_results
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
