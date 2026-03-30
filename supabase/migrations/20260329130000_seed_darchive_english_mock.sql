-- D.ARCHIVE 영어 카탈로그 ↔ 모의고사 · 3문항 시드
-- catalog id: 2662fb58-bd29-4007-a98b-7b81f5b6a7f3 → mock 26d62fb5-8bd2-4007-a98b-7b81f5b6a701
--
-- 선행 마이그레이션(순서대로 적용 필요):
--   20260329100000_fasttrack_mock_drill.sql  → fasttrack_chapters / mock_exams / problems 등
--   20260329110000_fasttrack_mock_exam_catalog.sql → 카탈로그 행 + 영어 subjects
--   20260329120000_fasttrack_problems_extended.sql → problem_number, instruction_text 등 확장 컬럼
--
-- Supabase 대시보드에서 이 파일만 실행하면 "relation fasttrack_chapters does not exist" 가 납니다.
-- `supabase db push` 또는 전체 migration 히스토리를 적용하세요.

DO $$
BEGIN
  IF to_regclass('public.fasttrack_chapters') IS NULL THEN
    RAISE EXCEPTION
      'fasttrack_chapters 가 없습니다. 먼저 20260329100000_fasttrack_mock_drill.sql 을 적용하세요.';
  END IF;
  IF to_regclass('public.fasttrack_problems') IS NULL THEN
    RAISE EXCEPTION
      'fasttrack_problems 가 없습니다. 먼저 20260329100000_fasttrack_mock_drill.sql 을 적용하세요.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fasttrack_problems'
      AND column_name = 'problem_number'
  ) THEN
    RAISE EXCEPTION
      'fasttrack_problems.problem_number 컬럼이 없습니다. 20260329120000_fasttrack_problems_extended.sql 을 적용하세요.';
  END IF;
END $$;

-- 카탈로그 마이그레이션보다 먼저 돌릴 때를 대비해 영어 과목 행 보강 (FK)
INSERT INTO public.subjects (id, name, category)
VALUES ('e1111111-1111-4111-8111-111111111101'::uuid, '영어', '영어')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category;

-- 영어 독해용 챕터·섹션 (code 는 전역 유니크이므로 DARCHIVE 전용 코드 사용)
INSERT INTO public.fasttrack_chapters (id, subject_id, name, code)
VALUES
  (
    'e2c00001-0001-4001-8001-000000000001'::uuid,
    'e1111111-1111-4111-8111-111111111101'::uuid,
    '독해·어법',
    'DARCHIVE_ENG_READ'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fasttrack_sections (id, subject_id, name, code)
VALUES
  (
    'e2s00001-0001-4001-8001-000000000001'::uuid,
    'e1111111-1111-4111-8111-111111111101'::uuid,
    '공통',
    'DARCHIVE_ENG_SEC'
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
    '26d62fb5-8bd2-4007-a98b-7b81f5b6a701'::uuid,
    'D.ARCHIVE 영어 (시드)',
    'external',
    'e1111111-1111-4111-8111-111111111101'::uuid,
    '2026-03-29',
    3,
    45,
    '카탈로그 darchive-english 연결용 샘플 3문항'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  total_questions = EXCLUDED.total_questions,
  time_limit_min = EXCLUDED.time_limit_min,
  description = EXCLUDED.description,
  updated_at = now();

UPDATE public.fasttrack_mock_exam_catalog
SET
  linked_mock_exam_id = '26d62fb5-8bd2-4007-a98b-7b81f5b6a701'::uuid,
  updated_at = now()
WHERE id = '2662fb58-bd29-4007-a98b-7b81f5b6a7f3'::uuid;

DELETE FROM public.fasttrack_problems
WHERE mock_exam_id = '26d62fb5-8bd2-4007-a98b-7b81f5b6a701'::uuid;

INSERT INTO public.fasttrack_problems (
  id,
  mock_exam_id,
  subject_id,
  chapter_id,
  section_id,
  problem_type,
  difficulty,
  problem_number,
  instruction_text,
  question_category,
  keywords,
  recommended_time_sec,
  question_text,
  passage,
  reference_view,
  choices,
  correct_answer,
  explanation
)
VALUES
  (
    '26d62fb5-8bd2-4007-a98b-7b81f5b6a704'::uuid,
    '26d62fb5-8bd2-4007-a98b-7b81f5b6a701'::uuid,
    'e1111111-1111-4111-8111-111111111101'::uuid,
    'e2c00001-0001-4001-8001-000000000001'::uuid,
    'e2s00001-0001-4001-8001-000000000001'::uuid,
    'multiple',
    'medium',
    1,
    '다음 글을 읽고 물음에 답하시오.',
    '독해',
    ARRAY['심경', '스포츠', '패배', '의지']::text[],
    180,
    '다음 글에 나타난 ‘I’의 심경 변화로 가장 적절한 것은?',
    $p1$The final buzzer echoed through the gym as the scoreboard
displayed a crushing defeat. I sat on the bench, staring at his
worn-out sneakers, the same ones I had worn since freshman year.
The ride home was silent, his teammates avoiding eye contact, each
lost in their own thoughts. The next morning, instead of sleeping in, I
laced up my sneakers and headed to the empty court. With each shot
I took, the memory of the loss seemed to fade, replaced by the
rhythm of the bouncing ball and the courage for the next game.$p1$,
    NULL,
    '[
      {"id":"1","text":"Defeated → Determined"},
      {"id":"2","text":"Relieved → Angry"},
      {"id":"3","text":"Surprised → Inspired"},
      {"id":"4","text":"Embarrassed → Grateful"},
      {"id":"5","text":"Regretful → Contented"}
    ]'::jsonb,
    '1',
    '패배 직후 벤치에 앉아 무력감에 잠긴 뒤, 다음 날 아침 코트에서 슛을 반복하며 패배의 기억이 옅어지고 다음 경기에 대한 용기로 바뀌는 흐름으로, 패배감에서 다짐·의지로 이어지는 심경에 가깝습니다.'
  ),
  (
    '26d62fb5-8bd2-4007-a98b-7b81f5b6a705'::uuid,
    '26d62fb5-8bd2-4007-a98b-7b81f5b6a701'::uuid,
    'e1111111-1111-4111-8111-111111111101'::uuid,
    'e2c00001-0001-4001-8001-000000000001'::uuid,
    'e2s00001-0001-4001-8001-000000000001'::uuid,
    'multiple',
    'medium',
    2,
    '다음 글을 읽고 물음에 답하시오.',
    '독해',
    ARRAY['논리', '감정', '설득', '주장']::text[],
    480,
    '다음 글에서 필자가 주장하는 바로 가장 적절한 것은?',
    $p2$It is a common misconception that the most compelling argument is
the one grounded in perfect logic. While logical consistency is
undoubtedly valuable, human communication is not dictated by reason
alone. An argument, no matter how rational, is likely to be ignored if
it overlooks the emotional mood of the listener. Conversely, it is
important to be aware of the fact that an opinion that lacks logical
precision but touches the listener’s emotions can yield more favorable
outcomes. In numerous instances, fostering kindness proves more
advantageous than rigid adherence to logical strictness. Prioritizing
emotional sensitivity often constitutes the more wise course of action.$p2$,
    NULL,
    '[
      {"id":"1","text":"논리적으로 완벽한 주장은 충분히 설득력을 가질 수 있다."},
      {"id":"2","text":"설득을 위한 논리적 일관성은 감정을 고려하는 것만큼 중요하다."},
      {"id":"3","text":"논리적 결함이 있어도 상대의 감정을 건드리면 더 나은 결과를 낳을 수 있다."},
      {"id":"4","text":"감정을 고려하지 않으면 논리적 주장은 상대방에게 거부감을 불러일으킬 가능성이 높다."},
      {"id":"5","text":"감정을 배려하는 것이 중요하지만, 논리적 정당성이 부족하면 효과적인 설득이 불가능하다."}
    ]'::jsonb,
    '3',
    '필자는 논리만으로 소통이 좌우되지 않으며, 논리적 정밀함이 부족해도 청자의 감정에 닿는 의견이 더 유리한 결과를 가져올 수 있다고 보며, 감정적 배려·친절을 논리적 엄격함보다 유리한 선택으로 제시합니다. 이에 가장 잘 맞는 것은 ③입니다.'
  ),
  (
    '26d62fb5-8bd2-4007-a98b-7b81f5b6a706'::uuid,
    '26d62fb5-8bd2-4007-a98b-7b81f5b6a701'::uuid,
    'e1111111-1111-4111-8111-111111111101'::uuid,
    'e2c00001-0001-4001-8001-000000000001'::uuid,
    'e2s00001-0001-4001-8001-000000000001'::uuid,
    'multiple',
    'hard',
    3,
    '다음 글에서 밑줄 친 부분이 의미하는 바로 가장 적절한 것은? [3점]',
    '독해',
    ARRAY['스트레스', '의미 해석', '3점']::text[],
    240,
    '밑줄 친 being stressed out is achievement가 뜻하는 바로 가장 적절한 것은?',
    $p3$The terms 'want to win' and 'have to win' influence one
another. As the former exhibits one's desire or a state of
mind independent of others' expectations and the latter
functions as the term representing the suppression of our
will, those should be viewed in light of a connective thread.
Being stressed can lead to a better result, and the difference
between the dynamics of performance and the dynamics of
stress should be seldom disparate with respect to the
multifaceted aspect that possibly regards the difference as the
same. To put it in a radical way,
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
being stressed out is achievement
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$p3$,
    '(시험지에서는 위 밑줄 구간이 강조 표시됩니다.)',
    '[
      {"id":"1","text":"our perceptions of ‘want’ and ‘have to’ are subtle"},
      {"id":"2","text":"stressful part is rather positive for our development"},
      {"id":"3","text":"others’ pressure stems from their aspiration to us"},
      {"id":"4","text":"considering a lot of aspects shows a different perspective"},
      {"id":"5","text":"we can reap what we have sown with difficulty"}
    ]'::jsonb,
    '2',
    '직전 문장에서 스트레스가 더 나은 결과로 이어질 수 있고, 성과와 스트레스의 역학이 다면적 관점에서는 동일시될 수 있다고 한 뒤, 극단적으로 표현하면 ‘스트레스 받는 것 자체가 성취(긍정적 의미의 성과)’라는 재해석에 가깝습니다. 즉 스트레스를 부정만이 아니라 발전·성과와 연결하는 태도로 읽는 것에 가장 가깝습니다(②).'
  );
