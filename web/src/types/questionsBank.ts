/**
 * `public.questions_bank` (실제 DB / MCP)
 * PK: question_id · FK: subject_id → subjects.id
 */
export type QuestionsBankRow = {
  question_id: string
  subject_id: string
  instruction: string | null
  content: string
  options: unknown
  answer: string
  explanation: string | null
  category_label: string | null
  tags: string[] | null
  estimated_time: number | null
  additional_passage: string | null
  diagram: boolean | null
  diagram_url: string | null
  created_at: string
  updated_at: string
}
