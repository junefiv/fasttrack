-- 안중근(연미정) 강의를 a2222222 / a3333333 에 복구하고,
-- 수학(3월 학평) 자막·회차는 별도 id(d…)로 분리합니다.
-- youtube_video_id UNIQUE 이므로: 먼저 a333 을 플레이스홀더 영상으로 바꾼 뒤 d333 에 수학 URL 을 넣습니다.
-- 이후: insert_ahn_lecture_captions.sql 실행

BEGIN;

-- 수학 전용 과목·강좌 (회차는 아래에서 a333 유튜브 키 해제 후 INSERT)
INSERT INTO public.subjects (id, name, category)
VALUES (
  'd1111111-1111-4111-8111-111111111101'::uuid,
  '수학',
  '수학'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category;

INSERT INTO public.lectures (id, subject_id, instructor, title, series_description)
VALUES (
  'd2222222-2222-4222-8222-222222222202'::uuid,
  'd1111111-1111-4111-8111-111111111101'::uuid,
  '이미지 강사',
  '3월 학평 문제풀이 강의',
  '3월 학편 문풀강의'
)
ON CONFLICT (id) DO UPDATE SET
  subject_id = EXCLUDED.subject_id,
  instructor = EXCLUDED.instructor,
  title = EXCLUDED.title,
  series_description = EXCLUDED.series_description;

-- 안중근 트랙 메타 먼저 (a333 의 youtube_id 를 바꿔 fHLkwvsBr1M 슬롯 비움)
UPDATE public.subjects
SET name = '사회', category = '역사'
WHERE id = 'a1111111-1111-4111-8111-111111111101'::uuid;

UPDATE public.lectures
SET
  subject_id = 'a1111111-1111-4111-8111-111111111101'::uuid,
  instructor = '연미정 강사',
  title = '안중근 역사강의',
  series_description = '안중근 역사강의입니다.'
WHERE id = 'a2222222-2222-4222-8222-222222222202'::uuid;

UPDATE public.lecture_sessions
SET
  lecture_id = 'a2222222-2222-4222-8222-222222222202'::uuid,
  session_order = 1,
  title = '1강. 안중근의 일대기',
  youtube_video_id = 'dQw4w9WgXcQ',
  youtube_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  total_duration_sec = NULL,
  thumbnail_url = NULL,
  caption = false
WHERE id = 'a3333333-3333-4333-8333-333333333303'::uuid;

-- 수학 회차 (이제 fHLkwvsBr1M 중복 없음)
INSERT INTO public.lecture_sessions (
  id,
  lecture_id,
  session_order,
  title,
  youtube_video_id,
  youtube_url,
  total_duration_sec,
  thumbnail_url,
  caption
)
VALUES (
  'd3333333-3333-4333-8333-333333333303'::uuid,
  'd2222222-2222-4222-8222-222222222202'::uuid,
  1,
  '3월 학평 확률과통계 문풀',
  'fHLkwvsBr1M',
  'https://www.youtube.com/watch?v=fHLkwvsBr1M',
  1500,
  NULL,
  false
)
ON CONFLICT (id) DO UPDATE SET
  lecture_id = EXCLUDED.lecture_id,
  session_order = EXCLUDED.session_order,
  title = EXCLUDED.title,
  youtube_video_id = EXCLUDED.youtube_video_id,
  youtube_url = EXCLUDED.youtube_url,
  total_duration_sec = EXCLUDED.total_duration_sec,
  thumbnail_url = EXCLUDED.thumbnail_url;

-- 수학 자막 → d3333333
UPDATE public.lecture_captions
SET lecture_session_id = 'd3333333-3333-4333-8333-333333333303'::uuid
WHERE lecture_session_id = 'a3333333-3333-4333-8333-333333333303'::uuid;

UPDATE public.learning_resources
SET lecture_id = 'a2222222-2222-4222-8222-222222222202'::uuid
WHERE id = '33261c64-b6d6-43f9-81f4-13498a56c8e6'::uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ebook_pages'
      AND column_name = 'lecture_session_id'
  ) THEN
    UPDATE public.ebook_pages
    SET lecture_session_id = 'a3333333-3333-4333-8333-333333333303'::uuid
    WHERE resource_id = '33261c64-b6d6-43f9-81f4-13498a56c8e6'::uuid;
  END IF;
END $$;

DELETE FROM public.lectures
WHERE id = 'c2222222-2222-4222-8222-222222222202'::uuid;

UPDATE public.lecture_sessions
SET caption = EXISTS (
  SELECT 1 FROM public.lecture_captions c
  WHERE c.lecture_session_id = lecture_sessions.id
)
WHERE id IN (
  'd3333333-3333-4333-8333-333333333303'::uuid,
  'a3333333-3333-4333-8333-333333333303'::uuid
);

COMMIT;
