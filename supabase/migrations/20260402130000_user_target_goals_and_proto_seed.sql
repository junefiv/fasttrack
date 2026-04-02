-- Pass-Nav: user_target_goals 스키마 + RLS (데이터 시드 없음 — 값은 대시보드/앱에서만 관리)

CREATE TABLE IF NOT EXISTS public.fasttrack_users (
  id uuid NOT NULL PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fasttrack_users IS
  'FastTrack 앱 사용자. FK용 최소 스키마이며 컬럼은 프로젝트에 맞게 확장하세요.';

CREATE TABLE IF NOT EXISTS public.user_target_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL,
  university_name text NOT NULL,
  department_name text NOT NULL,
  priority integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_target_goals_pkey PRIMARY KEY (id),
  CONSTRAINT user_target_goals_user_priority_unique UNIQUE (user_id, priority),
  CONSTRAINT user_target_goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.fasttrack_users (id) ON DELETE CASCADE,
  CONSTRAINT user_target_goals_priority_check CHECK ((priority = ANY (ARRAY[1, 2, 3])))
);

CREATE INDEX IF NOT EXISTS idx_user_target_goals_user ON public.user_target_goals USING btree (user_id);

COMMENT ON TABLE public.user_target_goals IS
  '사용자별 목표 대학·학과(1~3지망). 프론트는 이 테이블만 조회합니다.';

ALTER TABLE public.user_target_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_target_goals_proto_all" ON public.user_target_goals;
CREATE POLICY "user_target_goals_proto_all"
  ON public.user_target_goals
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
