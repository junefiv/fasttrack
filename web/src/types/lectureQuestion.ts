import type { LectureChatTurn, QuestionContextKind } from '../lib/gemini'

export type { QuestionContextKind }

/** 인강 질문 패널 탭(스레드) 하나 — DB `user_lecture_qa_threads` 1행과 대응 */
export type LectureQuestionThread = {
  id: string
  /** 이 탭을 연 시점(질문하기 클릭 시)의 재생 시각 */
  contextAtSec: number
  contextKind: QuestionContextKind
  /** contextKind === 'ebook' 일 때 PDF에서 선택한 원문(대화 전체에서 API에 유지) */
  ebookHighlight?: string
  /** 하이라이트가 있던 PDF 페이지(1-based) — 프롬프트 앵커 ±10페이지에 사용 */
  ebookHighlightPage?: number
  /** RAG 인덱싱·검색에 쓰는 동일 PDF URL */
  ebookPdfUrl?: string
  messages: LectureChatTurn[]
  /** 교재 등에서 드래그 인용 시 입력창에 미리 넣을 본문(첫 전송 전까지만 사용) */
  seedDraft?: string
}
