-- (선택) RLS를 켠 채로 anon 만 읽기 허용할 때 사용
-- 프로토타입은 `20260327140000_prototype_disable_rls_learning.sql` 로 RLS 끄는 편이 단순함
--
-- 강의 카탈로그: 브라우저에서 anon 키로 조회 가능하도록 SELECT 허용
-- 적용: Supabase Dashboard → SQL Editor 에서 실행하거나 `supabase db push` 로 반영

DROP POLICY IF EXISTS "Anon read subjects" ON public.subjects;
DROP POLICY IF EXISTS "Anon read lectures" ON public.lectures;
DROP POLICY IF EXISTS "Anon read lecture_sessions" ON public.lecture_sessions;
DROP POLICY IF EXISTS "Anon read lecture_captions" ON public.lecture_captions;

CREATE POLICY "Anon read subjects" ON public.subjects
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon read lectures" ON public.lectures
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon read lecture_sessions" ON public.lecture_sessions
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon read lecture_captions" ON public.lecture_captions
  FOR SELECT TO anon
  USING (true);
