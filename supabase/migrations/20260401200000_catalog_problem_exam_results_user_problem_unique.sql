-- 동일 사용자·문항은 한 행만 유지 → 재응시 시 UPDATE(upsert)
DELETE FROM public.fasttrack_mock_exam_catalog_problem_exam_results
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, problem_id
        ORDER BY submitted_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.fasttrack_mock_exam_catalog_problem_exam_results
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS fasttrack_catalog_problem_exam_results_user_problem_uq
  ON public.fasttrack_mock_exam_catalog_problem_exam_results (user_id, problem_id);
