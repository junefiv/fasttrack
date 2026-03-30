-- [폐기] 수학 시드가 안중근 강좌를 덮어쓴 뒤 임시로 쓰던 스크립트입니다.
-- 복구는 restore_ahn_lecture_and_split_math.sql + insert_ahn_lecture_captions.sql 를 사용하세요.
--
-- 수학 강좌(a2222222-…)에 묶여 있던 역사 전자책을 별도 강좌로 분리
BEGIN;

INSERT INTO public.lectures (id, subject_id, instructor, title, series_description)
VALUES (
  'c2222222-2222-4222-8222-222222222202'::uuid,
  'a1111111-1111-4111-8111-111111111101'::uuid,
  '—',
  '국민 탄생의 역사 (전자책만)',
  '영상 강의 없이 전자책만 연결된 항목입니다.'
)
ON CONFLICT (id) DO UPDATE SET
  subject_id = EXCLUDED.subject_id,
  instructor = EXCLUDED.instructor,
  title = EXCLUDED.title,
  series_description = EXCLUDED.series_description;

UPDATE public.learning_resources
SET lecture_id = 'c2222222-2222-4222-8222-222222222202'::uuid
WHERE id = '33261c64-b6d6-43f9-81f4-13498a56c8e6'::uuid;

COMMIT;
