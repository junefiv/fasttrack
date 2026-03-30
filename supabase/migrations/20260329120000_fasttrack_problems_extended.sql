-- 모의고사 문항 확장: 문제번호, 지시문, 표시용 유형, 키워드, 권장 풀이 시간
-- (기존 컬럼: question_text=발문, passage=지문, choices, correct_answer, explanation, problem_type=객관식/주관식, difficulty)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'fasttrack_problems'
  ) THEN
    ALTER TABLE public.fasttrack_problems
      ADD COLUMN IF NOT EXISTS problem_number integer,
      ADD COLUMN IF NOT EXISTS instruction_text text,
      ADD COLUMN IF NOT EXISTS question_category text,
      ADD COLUMN IF NOT EXISTS keywords text[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS recommended_time_sec integer;

    COMMENT ON COLUMN public.fasttrack_problems.problem_number IS '해당 모의고사 내 표시 번호(1부터 권장)';
    COMMENT ON COLUMN public.fasttrack_problems.instruction_text IS '지시문(예: 다음 글을 읽고 물음에 답하시오)';
    COMMENT ON COLUMN public.fasttrack_problems.question_category IS '문제 유형 라벨(예: 독서, 화법·작문) — problem_type(객관식/주관식)과 별개';
    COMMENT ON COLUMN public.fasttrack_problems.keywords IS '검색·추천용 키워드';
    COMMENT ON COLUMN public.fasttrack_problems.recommended_time_sec IS '권장 풀이 시간(초)';

    -- 기존 행에 시험별 연번 부여
    UPDATE public.fasttrack_problems p
    SET problem_number = s.rn
    FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY mock_exam_id ORDER BY created_at, id) AS rn
      FROM public.fasttrack_problems
    ) s
    WHERE p.id = s.id;

    -- 같은 시험에서 problem_number 가 겹치지 않도록 (NULL 은 여러 개 허용 → 미입력 문항 구분용)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fasttrack_problems_mock_exam_problem_number
      ON public.fasttrack_problems (mock_exam_id, problem_number)
      WHERE problem_number IS NOT NULL;
  END IF;
END $$;
