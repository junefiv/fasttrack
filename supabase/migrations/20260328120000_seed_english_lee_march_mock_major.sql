-- 시드: 과목(영어) + 이명학 강사 3월 학평 주요 문항 문풀 강좌 + 1강
-- 유튜브: https://www.youtube.com/watch?v=sJg5sQCjRjA
-- 자막·길이: migrations/20260328130000_lee_english_lecture_captions.sql (이 파일 이후 적용)

INSERT INTO public.subjects (id, name, category)
VALUES (
  'e1111111-1111-4111-8111-111111111101'::uuid,
  '영어',
  '영어'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category;

INSERT INTO public.lectures (id, subject_id, instructor, title, series_description)
VALUES (
  'e2222222-2222-4222-8222-222222222202'::uuid,
  'e1111111-1111-4111-8111-111111111101'::uuid,
  '이명학 강사',
  '3월 학평 주요 문항 문풀 (영어)',
  '3월 학평 문제풀이 중 주요 문항을 다루는 영어 문풀 강의입니다.'
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
  'e3333333-3333-4333-8333-333333333303'::uuid,
  'e2222222-2222-4222-8222-222222222202'::uuid,
  1,
  '3월 학평 주요 문항 문풀',
  'sJg5sQCjRjA',
  'https://www.youtube.com/watch?v=sJg5sQCjRjA',
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
