const QUESTIONS_BANK_DRILL_BASE = '/study/mock-exam/questions-bank'

/** 문제은행 드릴 딥링크 (`QuestionsBankDrillPage` — `subject`·`question` 쿼리) */
export function questionsBankDrillPath(opts: {
  subjectId?: string | null
  questionId?: string | null
}): string | null {
  const q = opts.questionId?.trim()
  if (!q) return null
  const s = opts.subjectId?.trim()
  const qEnc = encodeURIComponent(q)
  if (s) return `${QUESTIONS_BANK_DRILL_BASE}?subject=${encodeURIComponent(s)}&question=${qEnc}`
  return `${QUESTIONS_BANK_DRILL_BASE}?question=${qEnc}`
}

/** 문항 없이 과목만 지정해 드릴 진입 (베이스 URL만 쓰면 드릴 페이지가 거부함) */
export function questionsBankSubjectDrillPath(subjectId: string | null | undefined): string | null {
  const s = subjectId?.trim()
  if (!s) return null
  return `${QUESTIONS_BANK_DRILL_BASE}?subject=${encodeURIComponent(s)}`
}
