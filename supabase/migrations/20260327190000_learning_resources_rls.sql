-- learning_resources: VideoSession 이북 드로어에서 anon 으로 조회
-- 테이블은 대시보드 등에서 이미 만들었을 수 있음 — 없으면 이 블록은 건너뜀

DO $$
BEGIN
  IF to_regclass('public.learning_resources') IS NOT NULL THEN
    ALTER TABLE public.learning_resources DISABLE ROW LEVEL SECURITY;
  END IF;
END $$;
