export type ProblemType = 'multiple' | 'subjective'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type DrillVersion = 'upper' | 'lower'

export type ChoiceOption = { id: string; text: string }

export type FasttrackProblemRow = {
  id: string
  mock_exam_id: string
  subject_id: string
  chapter_id: string
  section_id: string | null
  problem_type: ProblemType
  difficulty: Difficulty
  /** 모의고사 내 번호(1부터 권장). 마이그레이션 전·구 데이터는 0일 수 있음 */
  problem_number?: number | null
  /** 지시문 */
  instruction_text?: string | null
  /** 표시용 유형(독서, 화법 등). problem_type 과 별개 */
  question_category?: string | null
  keywords?: string[] | null
  /** 권장 풀이 시간(초) */
  recommended_time_sec?: number | null
  question_text: string
  passage: string | null
  /** 도식 설명·SVG 마크업 등 (테이블에 컬럼이 있을 때) */
  diagram?: string | null
  /** 도식 이미지 URL (테이블에 컬럼이 있을 때) */
  diagram_url?: string | null
  reference_view: string | null
  choices: unknown
  correct_answer: string
  explanation: string | null
}

export type FasttrackDrillProblemRow = Omit<FasttrackProblemRow, 'mock_exam_id'> & {
  parent_problem_id: string
  version_type: DrillVersion
}

export type FasttrackMockExamRow = {
  id: string
  name: string
  exam_type: 'self' | 'external'
  subject_id: string
  exam_date: string
  total_questions: number
  time_limit_min: number
  description: string | null
  /** 모의고사 허브 카드(fasttrack_mock_exam_catalog)와 1:1 연결 시 */
  catalog_id?: string | null
}

export type FasttrackTestResultRow = {
  id: string
  user_id: string
  test_type: 'mock' | 'drill'
  reference_id: string
  score: number
  correct_count: number
  total_questions: number
  time_spent_sec: number
  completed_at: string
  /** 모의고사 응시 시 시험에 연결된 카탈로그(시리즈) id */
  catalog_id?: string | null
}

export type FasttrackUserAnswerRow = {
  id: string
  user_id: string
  result_id: string
  problem_id: string
  is_mock: boolean
  user_answer: string
  is_correct: boolean
}

export type FasttrackStudentStatRow = {
  id: string
  user_id: string
  subject_id: string
  chapter_id: string | null
  section_id: string | null
  problem_type: ProblemType | null
  analysis_date: string
  total_attempts: number
  correct_count: number
  accuracy_rate: number
  weakness_score: number
}

export type SubjectRow = { id: string; name: string; category: string | null }

/** 사설 모의고사 시리즈 카탈로그 (과목별 노출) */
export type FasttrackMockExamCatalogRow = {
  id: string
  subject_id: string
  slug: string
  title: string
  description: string
  sort_order: number
  linked_mock_exam_id: string | null
}
