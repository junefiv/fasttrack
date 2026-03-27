-- learning_resources: 강좌(lectures.id)만 연결 + anon 읽기 가능
-- (RLS 켜진 채 정책 없으면 웹에서 0건으로 보임)

ALTER TABLE public.learning_resources DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.learning_resources
  DROP COLUMN IF EXISTS lecture_session_id CASCADE,
  DROP COLUMN IF EXISTS subject_id CASCADE;

ALTER TABLE public.learning_resources
  ALTER COLUMN lecture_id SET NOT NULL;
