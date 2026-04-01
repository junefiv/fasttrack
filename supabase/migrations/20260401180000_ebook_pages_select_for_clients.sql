-- 모의고사 결과 등에서 클라이언트(anon/authenticated)가 ebook_pages 를 id 로 조회할 수 있게 합니다.
-- 카탈로그의 ebook_page_id 는 유효하지만, RLS 로 행이 0건이면 앱에 "교재 페이지 정보를 찾을 수 없습니다" 만 보입니다.

ALTER TABLE public.ebook_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ebook_pages_select_anon" ON public.ebook_pages;
CREATE POLICY "ebook_pages_select_anon"
  ON public.ebook_pages
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "ebook_pages_select_authenticated" ON public.ebook_pages;
CREATE POLICY "ebook_pages_select_authenticated"
  ON public.ebook_pages
  FOR SELECT
  TO authenticated
  USING (true);
