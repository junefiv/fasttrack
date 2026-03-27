-- 프로토타입 전용: 더미 데이터 테이블은 RLS 끄기 (테이블별 정책 관리 생략)
-- 운영/실서비스 전에는 반드시 RLS·권한을 다시 설계하세요.

ALTER TABLE public.subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecture_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecture_captions DISABLE ROW LEVEL SECURITY;
