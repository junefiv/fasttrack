-- 실제 DB(MCP): questions_bank / questions_bank_results 는 RLS on + 정책 없음 → anon 클라이언트 차단됨.
-- subjects 등과 동일하게 읽기/제출 허용(프로토타입).
DROP POLICY IF EXISTS "questions_bank_select_proto" ON public.questions_bank;

DROP POLICY IF EXISTS "questions_bank_results_all_proto" ON public.questions_bank_results;

CREATE POLICY "questions_bank_select_proto" ON public.questions_bank FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "questions_bank_results_all_proto" ON public.questions_bank_results FOR ALL TO anon, authenticated USING (true)
WITH
  CHECK (true);

GRANT SELECT ON TABLE public.questions_bank TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.questions_bank_results TO anon, authenticated;
