-- 사설 모의고사 브랜드/시리즈 카탈로그 (과목별 노출용, 이미지는 slug로 프론트 정적 파일과 매핑)
CREATE TABLE public.fasttrack_mock_exam_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects (id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  linked_mock_exam_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT fasttrack_mock_exam_catalog_slug_key UNIQUE (slug)
);

CREATE INDEX idx_fasttrack_mock_exam_catalog_subject_sort
  ON public.fasttrack_mock_exam_catalog (subject_id, sort_order);

COMMENT ON TABLE public.fasttrack_mock_exam_catalog IS '과목별 모의고사 시리즈(브랜드) 소개; slug는 웹 에셋 파일명과 1:1';
COMMENT ON COLUMN public.fasttrack_mock_exam_catalog.slug IS '정적 이미지 파일명(확장자 제외)과 동일, 예: igam-korean → igam-korean.jpg';
COMMENT ON COLUMN public.fasttrack_mock_exam_catalog.linked_mock_exam_id IS '연결 시 응시하기로 실제 fasttrack_mock_exams 이동';

ALTER TABLE public.fasttrack_mock_exam_catalog DISABLE ROW LEVEL SECURITY;

-- 이름으로 찾으면 프로젝트마다 누락될 수 있음 → 이 레포 시드와 동일한 subjects.id 로 보강 후 카탈로그 적재
INSERT INTO public.subjects (id, name, category)
VALUES
  ('f1111111-1111-4111-8111-111111111111'::uuid, '국어', '국어'),
  ('e1111111-1111-4111-8111-111111111101'::uuid, '영어', '영어'),
  ('a1111111-1111-4111-8111-111111111101'::uuid, '사회', '역사')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category;

INSERT INTO public.fasttrack_mock_exam_catalog (subject_id, slug, title, description, sort_order)
VALUES
  ('f1111111-1111-4111-8111-111111111111'::uuid, 'igam-korean', '이감국어', '간결해진 구성 더 깊어진 연계 학습', 10),
  ('f1111111-1111-4111-8111-111111111111'::uuid, 'sangsang-korean', '상상국어', '시작부터 끝까지 상상에 탑승하라!', 20),
  ('f1111111-1111-4111-8111-111111111111'::uuid, 'darchive-korean', 'D.ARCHIVE 국어', '더프 출제진만의 축적된 노하우 집대성', 30),
  ('e1111111-1111-4111-8111-111111111101'::uuid, 'darchive-english', 'D.ARCHIVE 영어', '수능영어, 종착점은 1등급!', 10),
  ('a1111111-1111-4111-8111-111111111101'::uuid, 'darchive-social', 'D.ARCHIVE 사탐', '사탐 선택은 전략입니다', 10)
ON CONFLICT (slug) DO UPDATE SET
  subject_id = EXCLUDED.subject_id,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
