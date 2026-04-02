-- 프로토타입: Pass-Nav 등이 anon 키로 읽을 수 있도록 RLS 해제 + anon/authenticated 권한 부여.
-- 대상 테이블이 없으면 건너뜁니다.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'fasttrack_users',
    'subjects',
    'fasttrack_mock_exam_catalog',
    'user_mastery_stats',
    'user_mock_exam_stats',
    'user_lecture_stats',
    'user_official_exam_stats',
    'user_target_goals',
    'university_benchmarks',
    'benchmark_mastery_stats',
    'benchmark_mock_exam_stats',
    'benchmark_lecture_stats',
    'benchmark_official_exam_stats',
    'lectures',
    'questions_bank',
    'questions_bank_results',
    'fasttrack_mock_exam_catalog_problems',
    'fasttrack_mock_exam_catalog_problem_exam_results',
    'ebook_pages'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'pass_nav_proto: skip missing table %', tbl;
    END;
    BEGIN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated',
        tbl
      );
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'pass_nav_proto: skip grant (missing) %', tbl;
    END;
  END LOOP;
END $$;
