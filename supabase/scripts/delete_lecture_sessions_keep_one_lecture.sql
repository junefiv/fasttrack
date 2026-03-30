-- lecture_id = 아래 UUID 인 회차만 남기고 lecture_sessions 나머지 전부 삭제
-- lecture_captions FK 때문에 자막 먼저 삭제

BEGIN;

DELETE FROM public.lecture_captions
WHERE lecture_session_id IN (
  SELECT id
  FROM public.lecture_sessions
  WHERE lecture_id IS DISTINCT FROM 'a2222222-2222-4222-8222-222222222202'::uuid
);

DELETE FROM public.lecture_sessions
WHERE lecture_id IS DISTINCT FROM 'a2222222-2222-4222-8222-222222222202'::uuid;

COMMIT;

SELECT lecture_id::text, count(*)::int AS session_count
FROM public.lecture_sessions
GROUP BY lecture_id
ORDER BY lecture_id;
