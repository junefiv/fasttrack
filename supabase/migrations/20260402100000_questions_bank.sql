-- 드릴학습형 문제은행: 문항 저장소 + 사용자 풀이 결과
CREATE TABLE public.questions_bank (
  question_id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  subject_id uuid NOT NULL REFERENCES public.subjects (id) ON DELETE CASCADE,
  instruction text NULL,
  content text NOT NULL,
  options jsonb NULL,
  answer text NOT NULL,
  explanation text NULL,
  category_label text NULL,
  tags text[] NULL,
  estimated_time integer NULL,
  additional_passage text NULL,
  diagram boolean NULL DEFAULT false,
  diagram_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_bank_subject_id ON public.questions_bank USING btree (subject_id);

CREATE INDEX IF NOT EXISTS idx_questions_bank_tags ON public.questions_bank USING gin (tags);

COMMENT ON TABLE public.questions_bank IS '과목별 문제은행 문항(드릴 추천의 기준).';

CREATE TABLE public.questions_bank_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL,
  question_id uuid NOT NULL REFERENCES public.questions_bank (question_id) ON DELETE CASCADE,
  user_answer text NOT NULL,
  answer_matches boolean NOT NULL DEFAULT false,
  is_correct boolean NOT NULL DEFAULT false,
  solve_time integer NULL,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_bank_results_user_question ON public.questions_bank_results (user_id, question_id);

CREATE INDEX IF NOT EXISTS idx_questions_bank_results_question_id ON public.questions_bank_results (question_id);

COMMENT ON TABLE public.questions_bank_results IS '문제은행 문항별 사용자 제출. answer_matches=내용 일치, is_correct=내용+권장시간 준수.';

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

CREATE TRIGGER trg_questions_bank_results_is_correct
  BEFORE INSERT OR UPDATE OF user_answer, question_id, solve_time ON public.questions_bank_results
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_questions_bank_result_is_correct ();

-- 약한 유형·태그 우선, 없으면 과목 내 랜덤(제외 목록 제외)
CREATE OR REPLACE FUNCTION public.pick_questions_bank_question (
  p_subject_id uuid,
  p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_weak_categories text[] DEFAULT ARRAY[]::text[],
  p_weak_tags text[] DEFAULT ARRAY[]::text[]
)
RETURNS SETOF public.questions_bank
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  picked_id uuid;
BEGIN
  SELECT qb.question_id INTO picked_id
  FROM public.questions_bank qb
  WHERE qb.subject_id = p_subject_id
  AND (cardinality(p_exclude_ids) = 0 OR NOT (qb.question_id = ANY (p_exclude_ids)))
  AND (
    (
      cardinality(p_weak_categories) > 0
      AND qb.category_label IS NOT NULL
      AND qb.category_label = ANY (p_weak_categories)
    )
    OR (
      cardinality(p_weak_tags) > 0
      AND qb.tags IS NOT NULL
      AND qb.tags && p_weak_tags
    )
  )
  ORDER BY random()
  LIMIT 1;

  IF picked_id IS NOT NULL THEN
    RETURN QUERY
    SELECT *
    FROM public.questions_bank
    WHERE question_id = picked_id;
    RETURN;
  END IF;

  SELECT qb.question_id INTO picked_id
  FROM public.questions_bank qb
  WHERE qb.subject_id = p_subject_id
  AND (cardinality(p_exclude_ids) = 0 OR NOT (qb.question_id = ANY (p_exclude_ids)))
  ORDER BY random()
  LIMIT 1;

  IF picked_id IS NOT NULL THEN
    RETURN QUERY
    SELECT *
    FROM public.questions_bank
    WHERE question_id = picked_id;
  END IF;
  RETURN;
END;
$$;

-- 전 사용자 기준 해당 문항 정답률 집계
CREATE OR REPLACE FUNCTION public.questions_bank_stats_for_question (p_question_id uuid)
RETURNS TABLE (
  correct_count bigint,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE r.is_correct), 0)::bigint AS correct_count,
    COALESCE(COUNT(*), 0)::bigint AS total_count
  FROM public.questions_bank_results r
  WHERE r.question_id = p_question_id;
$$;

ALTER TABLE public.questions_bank ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.questions_bank_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_bank_select_proto" ON public.questions_bank FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "questions_bank_results_all_proto" ON public.questions_bank_results FOR ALL TO anon, authenticated USING (true)
WITH
  CHECK (true);

GRANT SELECT ON public.questions_bank TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions_bank_results TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pick_questions_bank_question (uuid, uuid[], text[], text[]) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.questions_bank_stats_for_question (uuid) TO anon, authenticated;
