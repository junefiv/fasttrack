-- 답안 일치 여부(내용)와 권장 시간 초과를 분리해 기록하고, is_correct = 내용 일치 AND 시간 준수
ALTER TABLE public.questions_bank_results
ADD COLUMN IF NOT EXISTS answer_matches boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.questions_bank_results.answer_matches IS
  'user_answer가 questions_bank.answer와 trim 기준으로 일치하는지(내용 정답).';

COMMENT ON COLUMN public.questions_bank_results.is_correct IS
  'answer_matches 이고, estimated_time이 있으면 solve_time <= estimated_time 일 때만 true.';

-- 기존 행: 내용 일치만 복원(시간 규칙은 재계산)
UPDATE public.questions_bank_results r
SET
  answer_matches = (trim(r.user_answer) = trim(q.answer)),
  is_correct = (
    trim(r.user_answer) = trim(q.answer)
    AND (
      q.estimated_time IS NULL
      OR q.estimated_time <= 0
      OR (
        r.solve_time IS NOT NULL
        AND r.solve_time <= q.estimated_time
      )
    )
  )
FROM public.questions_bank q
WHERE q.question_id = r.question_id;

CREATE OR REPLACE FUNCTION public.fn_set_questions_bank_result_is_correct ()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected text;
  est integer;
  time_ok boolean;
BEGIN
  SELECT qb.answer, qb.estimated_time INTO expected, est
  FROM public.questions_bank qb
  WHERE qb.question_id = NEW.question_id;

  IF expected IS NULL THEN
    RAISE EXCEPTION 'questions_bank.question_id % not found', NEW.question_id;
  END IF;

  NEW.answer_matches := (trim(NEW.user_answer) = trim(expected));

  time_ok := true;
  IF est IS NOT NULL AND est > 0 THEN
    IF NEW.solve_time IS NULL OR NEW.solve_time > est THEN
      time_ok := false;
    END IF;
  END IF;

  NEW.is_correct := NEW.answer_matches AND time_ok;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_questions_bank_results_is_correct ON public.questions_bank_results;

CREATE TRIGGER trg_questions_bank_results_is_correct
  BEFORE INSERT OR UPDATE OF user_answer, question_id, solve_time ON public.questions_bank_results
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_questions_bank_result_is_correct ();
