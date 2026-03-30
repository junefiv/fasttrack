-- 카탈로그(fasttrack_mock_exam_catalog) 단위 문항 정의
-- 응시·결과 저장용 fasttrack_problems(mock_exam_id)와 별도로, 카탈로그 전용 스키마를 둡니다.

CREATE TABLE public.fasttrack_mock_exam_catalog_problems (
  problem_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.fasttrack_mock_exam_catalog (id) ON DELETE CASCADE,
  question_number integer NOT NULL,
  instruction text,
  content text,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer smallint NOT NULL,
  explanation text,
  category_label text,
  difficulty_level text NOT NULL DEFAULT '중',
  tags text[] NOT NULL DEFAULT '{}',
  estimated_time integer NOT NULL DEFAULT 120,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT fasttrack_mock_exam_catalog_problems_answer_range_chk
    CHECK (answer >= 1 AND answer <= 5),
  CONSTRAINT fasttrack_mock_exam_catalog_problems_difficulty_chk
    CHECK (difficulty_level = ANY (ARRAY['상'::text, '중'::text, '하'::text])),
  CONSTRAINT fasttrack_mock_exam_catalog_problems_catalog_qnum_key
    UNIQUE (catalog_id, question_number)
);

CREATE INDEX idx_fasttrack_mock_exam_catalog_problems_catalog
  ON public.fasttrack_mock_exam_catalog_problems (catalog_id);

CREATE INDEX idx_fasttrack_mock_exam_catalog_problems_category_label
  ON public.fasttrack_mock_exam_catalog_problems (catalog_id, category_label);

COMMENT ON TABLE public.fasttrack_mock_exam_catalog_problems IS 'fasttrack_mock_exam_catalog.id(시리즈)별 문항 본문·선지·메타';
COMMENT ON COLUMN public.fasttrack_mock_exam_catalog_problems.instruction IS '발문·지시문 (예: 다음 글의 주제로...)';
COMMENT ON COLUMN public.fasttrack_mock_exam_catalog_problems.content IS '지문; 앱에서 Markdown/HTML 렌더링 가능';
COMMENT ON COLUMN public.fasttrack_mock_exam_catalog_problems.options IS '선택지 JSON (예: [{"id":"1","text":"..."}, ...])';
COMMENT ON COLUMN public.fasttrack_mock_exam_catalog_problems.answer IS '정답 번호 1~5';
COMMENT ON COLUMN public.fasttrack_mock_exam_catalog_problems.category_label IS '문항 유형 라벨(심경 변화, 주장 파악 등); 별도 마스터 테이블 없음';
COMMENT ON COLUMN public.fasttrack_mock_exam_catalog_problems.estimated_time IS '권장 풀이 시간(초)';

ALTER TABLE public.fasttrack_mock_exam_catalog_problems DISABLE ROW LEVEL SECURITY;

-- 시드: D.ARCHIVE 영어(darchive-english) 3문항
-- catalog 행은 INSERT 시 id가 환경마다 다를 수 있으므로 slug 로 조회합니다.
DO $$
DECLARE
  v_catalog_id uuid;
BEGIN
  SELECT id
  INTO v_catalog_id
  FROM public.fasttrack_mock_exam_catalog
  WHERE slug = 'darchive-english'
  LIMIT 1;

  IF v_catalog_id IS NULL THEN
    RAISE NOTICE 'fasttrack_mock_exam_catalog 에 slug=darchive-english 가 없어 catalog_problems 시드를 건너뜁니다.';
    RETURN;
  END IF;

  DELETE FROM public.fasttrack_mock_exam_catalog_problems
  WHERE catalog_id = v_catalog_id;

  INSERT INTO public.fasttrack_mock_exam_catalog_problems (
    problem_id,
    catalog_id,
    question_number,
    instruction,
    content,
    options,
    answer,
    explanation,
    category_label,
    difficulty_level,
    tags,
    estimated_time
  )
  VALUES
    (
      'ce900001-0001-4001-8001-000000000001'::uuid,
      v_catalog_id,
      19,
      '다음 글을 읽고 물음에 답하시오.',
      $c1$The final buzzer echoed through the gym as the scoreboard
displayed a crushing defeat. I sat on the bench, staring at his
worn-out sneakers, the same ones I had worn since freshman year.
The ride home was silent, his teammates avoiding eye contact, each
lost in their own thoughts. The next morning, instead of sleeping in, I
laced up my sneakers and headed to the empty court. With each shot
I took, the memory of the loss seemed to fade, replaced by the
rhythm of the bouncing ball and the courage for the next game.$c1$,
      '[
        {"id":"1","text":"Defeated → Determined"},
        {"id":"2","text":"Relieved → Angry"},
        {"id":"3","text":"Surprised → Inspired"},
        {"id":"4","text":"Embarrassed → Grateful"},
        {"id":"5","text":"Regretful → Contented"}
      ]'::jsonb,
      1,
      '패배 직후 벤치에 앉아 무력감에 잠긴 뒤, 다음 날 아침 코트에서 슛을 반복하며 패배의 기억이 옅어지고 다음 경기에 대한 용기로 바뀌는 흐름으로, 패배감에서 다짐·의지로 이어지는 심경에 가깝습니다.',
      '심경 변화',
      '중',
      ARRAY['#심경변화', '#스포츠', '#독해']::text[],
      180
    ),
    (
      'ce900002-0001-4001-8001-000000000002'::uuid,
      v_catalog_id,
      20,
      '다음 글을 읽고 물음에 답하시오.',
      $c2$It is a common misconception that the most compelling argument is
the one grounded in perfect logic. While logical consistency is
undoubtedly valuable, human communication is not dictated by reason
alone. An argument, no matter how rational, is likely to be ignored if
it overlooks the emotional mood of the listener. Conversely, it is
important to be aware of the fact that an opinion that lacks logical
precision but touches the listener’s emotions can yield more favorable
outcomes. In numerous instances, fostering kindness proves more
advantageous than rigid adherence to logical strictness. Prioritizing
emotional sensitivity often constitutes the more wise course of action.$c2$,
      '[
        {"id":"1","text":"논리적으로 완벽한 주장은 충분히 설득력을 가질 수 있다."},
        {"id":"2","text":"설득을 위한 논리적 일관성은 감정을 고려하는 것만큼 중요하다."},
        {"id":"3","text":"논리적 결함이 있어도 상대의 감정을 건드리면 더 나은 결과를 낳을 수 있다."},
        {"id":"4","text":"감정을 고려하지 않으면 논리적 주장은 상대방에게 거부감을 불러일으킬 가능성이 높다."},
        {"id":"5","text":"감정을 배려하는 것이 중요하지만, 논리적 정당성이 부족하면 효과적인 설득이 불가능하다."}
      ]'::jsonb,
      3,
      '필자는 논리만으로 소통이 좌우되지 않으며, 논리적 정밀함이 부족해도 청자의 감정에 닿는 의견이 더 유리한 결과를 가져올 수 있다고 보며, 감정적 배려·친절을 논리적 엄격함보다 유리한 선택으로 제시합니다. 이에 가장 잘 맞는 것은 ③입니다.',
      '주장 파악',
      '중',
      ARRAY['#논리와감정', '#주장', '#설득', '#독해']::text[],
      480
    ),
    (
      'ce900003-0001-4001-8001-000000000003'::uuid,
      v_catalog_id,
      21,
      '다음 글에서 밑줄 친 부분이 의미하는 바로 가장 적절한 것은? [3점]',
      $c3$The terms 'want to win' and 'have to win' influence one
another. As the former exhibits one's desire or a state of
mind independent of others' expectations and the latter
functions as the term representing the suppression of our
will, those should be viewed in light of a connective thread.
Being stressed can lead to a better result, and the difference
between the dynamics of performance and the dynamics of
stress should be seldom disparate with respect to the
multifaceted aspect that possibly regards the difference as the
same. To put it in a radical way,
**being stressed out is achievement**
$c3$,
      '[
        {"id":"1","text":"our perceptions of ‘want’ and ‘have to’ are subtle"},
        {"id":"2","text":"stressful part is rather positive for our development"},
        {"id":"3","text":"others’ pressure stems from their aspiration to us"},
        {"id":"4","text":"considering a lot of aspects shows a different perspective"},
        {"id":"5","text":"we can reap what we have sown with difficulty"}
      ]'::jsonb,
      2,
      '직전 문장에서 스트레스가 더 나은 결과로 이어질 수 있고, 성과와 스트레스의 역학이 다면적 관점에서는 동일시될 수 있다고 한 뒤, 극단적으로 표현하면 ‘스트레스 받는 것 자체가 성취(긍정적 의미의 성과)’라는 재해석에 가깝습니다. 즉 스트레스를 부정만이 아니라 발전·성과와 연결하는 태도로 읽는 것에 가장 가깝습니다(②).',
      '의미 해석',
      '상',
      ARRAY['#의미해석', '#스트레스', '#3점', '#독해']::text[],
      240
    );
END $$;
