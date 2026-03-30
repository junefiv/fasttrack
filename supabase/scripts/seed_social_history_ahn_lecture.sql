-- Supabase Dashboard → SQL Editor 에서 실행 (또는: supabase db push 로 migrations 반영)
-- 내용은 migrations/20260328000000_seed_social_history_ahn_lecture.sql 과 동일

INSERT INTO public.subjects (id, name, category)
VALUES (
  'a1111111-1111-4111-8111-111111111101'::uuid,
  '사회',
  '역사'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category;

INSERT INTO public.lectures (id, subject_id, instructor, title, series_description)
VALUES (
  'a2222222-2222-4222-8222-222222222202'::uuid,
  'a1111111-1111-4111-8111-111111111101'::uuid,
  '연미정 강사',
  '안중근 역사강의',
  '안중근 역사강의입니다.'
)
ON CONFLICT (id) DO UPDATE SET
  subject_id = EXCLUDED.subject_id,
  instructor = EXCLUDED.instructor,
  title = EXCLUDED.title,
  series_description = EXCLUDED.series_description;

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
  'a3333333-3333-4333-8333-333333333303'::uuid,
  'a2222222-2222-4222-8222-222222222202'::uuid,
  1,
  '1강. 안중근의 일대기',
  'dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  NULL,
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
  thumbnail_url = EXCLUDED.thumbnail_url,
  caption = EXCLUDED.caption;

-- 확인
SELECT s.name AS subject_name, s.category, l.instructor, l.title AS lecture_title,
       ls.session_order, ls.title AS session_title, ls.youtube_video_id
FROM public.subjects s
JOIN public.lectures l ON l.subject_id = s.id
JOIN public.lecture_sessions ls ON ls.lecture_id = l.id
WHERE s.id = 'a1111111-1111-4111-8111-111111111101'::uuid;
