import type { FasttrackMockExamCatalogRow, FasttrackProblemRow } from '../types/fasttrack'

/** 미리보기용 더미 chapter_id (DB에 없어도 화면만 구성할 때 사용) */
export const PREVIEW_PLACEHOLDER_CHAPTER_ID = '00000000-0000-4000-8000-000000000001'

export function buildCatalogPreviewExamMeta(catalog: FasttrackMockExamCatalogRow): {
  name: string
  time_limit_min: number
  total_questions: number
} {
  return {
    name: `${catalog.title} · UI 미리보기`,
    time_limit_min: 60,
    total_questions: 2,
  }
}

/**
 * 카탈로그만 있고 linked_mock_exam_id 가 없을 때 응시 화면 레이아웃을 보여 주기 위한 샘플 문항.
 * DB 스키마에 맞춘 필드 구성 예시이며, 실제 시험 연결 후에는 fasttrack_problems 데이터로 대체됩니다.
 */
export function buildCatalogPreviewProblems(catalog: FasttrackMockExamCatalogRow): FasttrackProblemRow[] {
  const slug = catalog.slug
  return [
    {
      id: `preview-${catalog.id}-1`,
      mock_exam_id: `preview-exam-${catalog.id}`,
      subject_id: catalog.subject_id,
      chapter_id: PREVIEW_PLACEHOLDER_CHAPTER_ID,
      section_id: null,
      problem_type: 'multiple',
      difficulty: 'medium',
      problem_number: 1,
      instruction_text: '다음 담화를 읽고, 물음에 답하시오.',
      question_category: '독서',
      keywords: ['화법', '태도', '담화'],
      recommended_time_sec: 180,
      question_text: '화자의 태도로 가장 적절한 것은?',
      passage:
        '“이번 개편은 속도보다 방향이 중요합니다. 우리는 당장의 점수보다 재현 가능한 학습 경로를 남기려 합니다.”\n\n' +
        `(${slug}) 시리즈에 연결할 실제 지문·선택지는 DB의 passage, choices 컬럼에 넣으면 됩니다.`,
      reference_view: null,
      choices: [
        { id: '1', text: '결과만을 절대 기준으로 삼고 있다.' },
        { id: '2', text: '외부 평가를 전면 부정하고 있다.' },
        { id: '3', text: '지속 가능한 학습 체계를 우선하려 한다.' },
        { id: '4', text: '변화 자체를 최대한 빨리 끝내려 한다.' },
        { id: '5', text: '구성원의 의견 수렴을 거부하고 있다.' },
      ],
      correct_answer: '3',
      explanation:
        '화자는 “속도보다 방향”, “재현 가능한 학습 경로”를 강조하므로 단기 점수보다 체계적인 학습을 중시하는 태도에 가깝습니다.',
    },
    {
      id: `preview-${catalog.id}-2`,
      mock_exam_id: `preview-exam-${catalog.id}`,
      subject_id: catalog.subject_id,
      chapter_id: PREVIEW_PLACEHOLDER_CHAPTER_ID,
      section_id: null,
      problem_type: 'multiple',
      difficulty: 'easy',
      problem_number: 2,
      instruction_text: '다음을 참고하여 물음에 답하시오.',
      question_category: '문법',
      keywords: ['연결어미', '문장'],
      recommended_time_sec: 90,
      question_text: '다음 중 어법상 옳은 문장만을 고른 것은?',
      passage: null,
      reference_view: '① 나는 책을 읽으면서 커피를 마신다.\n② 나는 책을 읽으면서 커피를 마시었다.',
      choices: [
        { id: '1', text: '①' },
        { id: '2', text: '②' },
        { id: '3', text: '①, ②' },
        { id: '4', text: '①만 옳다' },
        { id: '5', text: '②만 옳다' },
      ],
      correct_answer: '5',
      explanation: '미리보기용 더미 해설입니다. 실제 해설은 explanation 컬럼에 저장합니다.',
    },
  ]
}
