/** 미리보기 응시 → 결과 화면으로 넘길 때 `navigate(..., { state })` 용 */
export type MockExamPreviewResultSheet = {
  id: string
  question_number: number
  instruction: string | null
  reading_body: string | null
  diagram: string | null
  diagram_url: string | null
  passage: string | null
  options: unknown
  correct_answer: string
  explanation?: string | null
  /** 카탈로그 문항 행의 교재 페이지 UUID */
  ebook_page_id?: string | null
  /** 카탈로그 문항 행의 자막 UUID */
  lecture_caption_id?: string | null
}

export type MockExamPreviewResultLocationState = {
  examName: string
  timeSpentSec: number
  sheets: MockExamPreviewResultSheet[]
  answers: Record<string, string>
}

export function isMockExamPreviewResultState(x: unknown): x is MockExamPreviewResultLocationState {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.examName === 'string' &&
    typeof o.timeSpentSec === 'number' &&
    Array.isArray(o.sheets) &&
    o.answers !== null &&
    typeof o.answers === 'object'
  )
}
