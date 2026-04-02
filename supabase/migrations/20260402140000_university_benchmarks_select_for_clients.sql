-- Pass-Nav: 클라이언트(anon/authenticated)가 university_benchmarks 를 읽을 수 있게 함.
-- 대시보드/SQL(service_role)로만 넣은 행이 앱에서는 0건으로 보이던 경우( RLS 기본 거부 )를 해소.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'university_benchmarks'
  ) THEN
    ALTER TABLE public.university_benchmarks ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "university_benchmarks_select_clients" ON public.university_benchmarks;
    CREATE POLICY "university_benchmarks_select_clients"
      ON public.university_benchmarks
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
