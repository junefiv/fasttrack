-- 모의고사 & 드릴 (fasttrack_*) — 스키마 + 프로토타입 RLS 비활성화 + 최소 시드

-- =============================================
-- 1. 참조 테이블
-- =============================================
CREATE TABLE public.fasttrack_chapters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL,
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fasttrack_chapters_pkey PRIMARY KEY (id),
  CONSTRAINT fasttrack_chapters_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE
);

CREATE TABLE public.fasttrack_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fasttrack_sections_pkey PRIMARY KEY (id),
  CONSTRAINT fasttrack_sections_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id)
);

-- =============================================
-- 2. 모의고사
-- =============================================
CREATE TABLE public.fasttrack_mock_exams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  exam_type text NOT NULL CHECK (exam_type = ANY (ARRAY['self'::text, 'external'::text])),
  subject_id uuid NOT NULL,
  exam_date date NOT NULL,
  total_questions integer NOT NULL,
  time_limit_min integer NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fasttrack_mock_exams_pkey PRIMARY KEY (id),
  CONSTRAINT fasttrack_mock_exams_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id)
);

CREATE TABLE public.fasttrack_problems (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mock_exam_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  chapter_id uuid NOT NULL,
  section_id uuid,
  problem_type text NOT NULL CHECK (problem_type = ANY (ARRAY['multiple'::text, 'subjective'::text])),
  difficulty text NOT NULL CHECK (difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])),
  question_text text NOT NULL,
  passage text,
  reference_view text,
  choices jsonb,
  correct_answer text NOT NULL,
  explanation text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fasttrack_problems_pkey PRIMARY KEY (id),
  CONSTRAINT fasttrack_problems_mock_exam_id_fkey
    FOREIGN KEY (mock_exam_id) REFERENCES public.fasttrack_mock_exams(id) ON DELETE CASCADE,
  CONSTRAINT fasttrack_problems_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id),
  CONSTRAINT fasttrack_problems_chapter_id_fkey
    FOREIGN KEY (chapter_id) REFERENCES public.fasttrack_chapters(id),
  CONSTRAINT fasttrack_problems_section_id_fkey
    FOREIGN KEY (section_id) REFERENCES public.fasttrack_sections(id)
);

CREATE INDEX idx_fasttrack_problems_subject_chapter
  ON public.fasttrack_problems(subject_id, chapter_id);
CREATE INDEX idx_fasttrack_problems_section
  ON public.fasttrack_problems(section_id);

-- =============================================
-- 3. 드릴 문제
-- =============================================
CREATE TABLE public.fasttrack_drill_problems (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  parent_problem_id uuid NOT NULL,
  version_type text NOT NULL CHECK (version_type = ANY (ARRAY['upper'::text, 'lower'::text])),
  subject_id uuid NOT NULL,
  chapter_id uuid NOT NULL,
  section_id uuid,
  problem_type text NOT NULL CHECK (problem_type = ANY (ARRAY['multiple'::text, 'subjective'::text])),
  difficulty text NOT NULL CHECK (difficulty = ANY (ARRAY['easy'::text, 'medium'::text, 'hard'::text])),
  question_text text NOT NULL,
  passage text,
  reference_view text,
  choices jsonb,
  correct_answer text NOT NULL,
  explanation text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fasttrack_drill_problems_pkey PRIMARY KEY (id),
  CONSTRAINT fasttrack_drill_problems_parent_problem_id_fkey
    FOREIGN KEY (parent_problem_id) REFERENCES public.fasttrack_problems(id) ON DELETE CASCADE,
  CONSTRAINT fasttrack_drill_problems_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id),
  CONSTRAINT fasttrack_drill_problems_chapter_id_fkey
    FOREIGN KEY (chapter_id) REFERENCES public.fasttrack_chapters(id),
  CONSTRAINT fasttrack_drill_problems_section_id_fkey
    FOREIGN KEY (section_id) REFERENCES public.fasttrack_sections(id)
);

-- =============================================
-- 4. 응시 결과 · 정오답 · 통계
-- =============================================
CREATE TABLE public.fasttrack_test_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  test_type text NOT NULL CHECK (test_type = ANY (ARRAY['mock'::text, 'drill'::text])),
  reference_id uuid NOT NULL,
  score integer NOT NULL,
  correct_count integer NOT NULL,
  total_questions integer NOT NULL,
  time_spent_sec integer NOT NULL,
  completed_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fasttrack_test_results_pkey PRIMARY KEY (id)
);

CREATE TABLE public.fasttrack_user_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  result_id uuid NOT NULL,
  problem_id uuid NOT NULL,
  is_mock boolean NOT NULL,
  user_answer text NOT NULL,
  is_correct boolean NOT NULL,
  answered_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fasttrack_user_answers_pkey PRIMARY KEY (id),
  CONSTRAINT fasttrack_user_answers_result_id_fkey
    FOREIGN KEY (result_id) REFERENCES public.fasttrack_test_results(id) ON DELETE CASCADE
);

CREATE INDEX idx_fasttrack_user_answers_user_problem_correct
  ON public.fasttrack_user_answers(user_id, problem_id, is_correct);

CREATE TABLE public.fasttrack_student_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  chapter_id uuid,
  section_id uuid,
  problem_type text CHECK (problem_type = ANY (ARRAY['multiple'::text, 'subjective'::text])),
  analysis_date date NOT NULL,
  total_attempts integer NOT NULL DEFAULT 0,
  correct_count integer NOT NULL DEFAULT 0,
  accuracy_rate numeric(5,2) NOT NULL,
  weakness_score numeric(5,2) NOT NULL,
  last_updated timestamp with time zone DEFAULT now(),
  CONSTRAINT fasttrack_student_stats_pkey PRIMARY KEY (id),
  CONSTRAINT fasttrack_student_stats_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id),
  CONSTRAINT fasttrack_student_stats_chapter_id_fkey
    FOREIGN KEY (chapter_id) REFERENCES public.fasttrack_chapters(id),
  CONSTRAINT fasttrack_student_stats_section_id_fkey
    FOREIGN KEY (section_id) REFERENCES public.fasttrack_sections(id)
);

CREATE UNIQUE INDEX idx_fasttrack_student_stats_user_subject_chapter_date
  ON public.fasttrack_student_stats(user_id, subject_id, chapter_id, analysis_date);

-- =============================================
-- 5. 프로토타입 RLS
-- =============================================
ALTER TABLE public.fasttrack_chapters DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fasttrack_sections DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fasttrack_mock_exams DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fasttrack_problems DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fasttrack_drill_problems DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fasttrack_test_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fasttrack_user_answers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fasttrack_student_stats DISABLE ROW LEVEL SECURITY;

-- =============================================
-- 6. 시드: 과목(국어·수학) + 수학 챕터/섹션 + 모의고사 + 문제 + 드릴 2개
-- =============================================
INSERT INTO public.subjects (id, name, category)
VALUES
  ('f1111111-1111-4111-8111-111111111111'::uuid, '국어', '국어'),
  ('f2222222-2222-4222-8222-222222222222'::uuid, '수학', '수학')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category;

INSERT INTO public.fasttrack_chapters (id, subject_id, name, code)
VALUES
  (
    'fc111111-1111-4111-8111-111111111101'::uuid,
    'f2222222-2222-4222-8222-222222222222'::uuid,
    '미적분II',
    'MATH_CALC2'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fasttrack_sections (id, subject_id, name, code)
VALUES
  (
    'fs111111-1111-4111-8111-111111111102'::uuid,
    'f2222222-2222-4222-8222-222222222222'::uuid,
    '공통',
    'MATH_COMMON'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fasttrack_mock_exams (
  id,
  name,
  exam_type,
  subject_id,
  exam_date,
  total_questions,
  time_limit_min,
  description
)
VALUES
  (
    'fe111111-1111-4111-8111-111111111103'::uuid,
    '2026 FASTTRACK 수학 샘플 모의고사',
    'self',
    'f2222222-2222-4222-8222-222222222222'::uuid,
    '2026-03-15',
    2,
    50,
    '프로토타입용 2문항 샘플 시험입니다.'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fasttrack_problems (
  id,
  mock_exam_id,
  subject_id,
  chapter_id,
  section_id,
  problem_type,
  difficulty,
  question_text,
  passage,
  reference_view,
  choices,
  correct_answer,
  explanation
)
VALUES
  (
    'fp111111-1111-4111-8111-111111111104'::uuid,
    'fe111111-1111-4111-8111-111111111103'::uuid,
    'f2222222-2222-4222-8222-222222222222'::uuid,
    'fc111111-1111-4111-8111-111111111101'::uuid,
    'fs111111-1111-4111-8111-111111111102'::uuid,
    'multiple',
    'medium',
    '함수 f(x)=x^2-4x+3 의 최솟값은?',
    NULL,
    NULL,
    '[
      {"id":"1","text":"-1"},
      {"id":"2","text":"0"},
      {"id":"3","text":"1"},
      {"id":"4","text":"3"},
      {"id":"5","text":"4"}
    ]'::jsonb,
    '1',
    'f(x)=(x-2)^2-1 이므로 x=2에서 최솟값 -1.'
  ),
  (
    'fp222222-2222-4222-8222-222222222105'::uuid,
    'fe111111-1111-4111-8111-111111111103'::uuid,
    'f2222222-2222-4222-8222-222222222222'::uuid,
    'fc111111-1111-4111-8111-111111111101'::uuid,
    'fs111111-1111-4111-8111-111111111102'::uuid,
    'multiple',
    'easy',
    'lim(x→0) sin x / x 의 값은?',
    NULL,
    NULL,
    '[
      {"id":"1","text":"0"},
      {"id":"2","text":"1"},
      {"id":"3","text":"∞"},
      {"id":"4","text":"정의되지 않음"},
      {"id":"5","text":"-1"}
    ]'::jsonb,
    '2',
    '표준 극한값 1입니다.'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fasttrack_drill_problems (
  id,
  parent_problem_id,
  version_type,
  subject_id,
  chapter_id,
  section_id,
  problem_type,
  difficulty,
  question_text,
  passage,
  reference_view,
  choices,
  correct_answer,
  explanation
)
VALUES
  (
    'fd111111-1111-4111-8111-111111111106'::uuid,
    'fp111111-1111-4111-8111-111111111104'::uuid,
    'upper',
    'f2222222-2222-4222-8222-222222222222'::uuid,
    'fc111111-1111-4111-8111-111111111101'::uuid,
    'fs111111-1111-4111-8111-111111111102'::uuid,
    'multiple',
    'hard',
    '[상위] 함수 f(x)=x^3-6x^2+9x 의 극솟값은?',
    NULL,
    NULL,
    '[
      {"id":"1","text":"0"},
      {"id":"2","text":"1"},
      {"id":"3","text":"2"},
      {"id":"4","text":"3"},
      {"id":"5","text":"4"}
    ]'::jsonb,
    '1',
    'f''(x)=3x^2-12x+9=3(x-1)(x-3), 극솟값 f(3)=0.'
  ),
  (
    'fd222222-2222-4222-8222-222222222107'::uuid,
    'fp111111-1111-4111-8111-111111111104'::uuid,
    'lower',
    'f2222222-2222-4222-8222-222222222222'::uuid,
    'fc111111-1111-4111-8111-111111111101'::uuid,
    'fs111111-1111-4111-8111-111111111102'::uuid,
    'multiple',
    'easy',
    '[하위] f(x)=x^2 의 f(2) 값은?',
    NULL,
    NULL,
    '[
      {"id":"1","text":"2"},
      {"id":"2","text":"4"},
      {"id":"3","text":"8"},
      {"id":"4","text":"16"},
      {"id":"5","text":"1"}
    ]'::jsonb,
    '2',
    '2^2=4'
  )
ON CONFLICT (id) DO NOTHING;
