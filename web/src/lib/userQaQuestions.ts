import { supabase } from './supabase'
import type { StudyArchiveQuestionItem } from './gemini'

export type UserQaQuestionRow = {
  id: string
  user_id: string
  subject_id: string
  kind: string
  instruction: string
  content: string
  options: unknown
  answer: string
  explanation: string | null
  category_label: string | null
  tags: string[] | null
  difficulty_level: string | null
  estimated_time: number | null
  additional_passage: string | null
  diagram_url: string | null
  source_thread_ids: string[]
  created_at: string
  updated_at: string
}

function optionsForDb(q: StudyArchiveQuestionItem): unknown | null {
  if (q.kind !== 'multiple_choice') return null
  const choices = q.choices ?? []
  if (choices.length === 0) return null
  return choices.map((text, i) => ({ id: i + 1, text }))
}

function answerForDb(q: StudyArchiveQuestionItem): string {
  if (q.kind === 'multiple_choice' && q.choices && q.choices.length > 0) {
    const a = q.answer.trim()
    const byText = q.choices.findIndex((c) => c.trim() === a)
    if (byText >= 0) return String(byText + 1)
    const n = parseInt(a, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= q.choices.length) return String(n)
  }
  return q.answer.trim()
}

function tagsForDb(q: StudyArchiveQuestionItem): string[] {
  const t = q.tags
  if (!t || !Array.isArray(t)) return []
  return [...new Set(t.map((x) => String(x).trim()).filter(Boolean))].slice(0, 24)
}

/** Gemini 복습 문항 → public.user_qa_questions 다건 INSERT */
export async function insertUserQaQuestionsFromArchive(input: {
  userId: string
  subjectId: string
  sourceThreadIds: string[]
  questions: StudyArchiveQuestionItem[]
}): Promise<{ error: Error | null; inserted: number }> {
  const ids = [...new Set(input.sourceThreadIds)].filter((x) => x.length > 0)
  if (input.questions.length === 0) return { error: null, inserted: 0 }

  const rows = input.questions.map((q) => ({
    user_id: input.userId,
    subject_id: input.subjectId,
    kind: q.kind,
    instruction: (q.instruction ?? '').trim() || (q.stem ?? '').trim(),
    content: (q.content ?? '').trim(),
    options: optionsForDb(q),
    answer: answerForDb(q),
    explanation: q.explanation?.trim() || q.hint?.trim() || null,
    category_label: q.category_label?.trim() || null,
    tags: tagsForDb(q),
    difficulty_level: q.difficulty_level?.trim() || null,
    estimated_time:
      typeof q.estimated_time === 'number' && Number.isFinite(q.estimated_time)
        ? Math.max(0, Math.floor(q.estimated_time))
        : null,
    additional_passage: q.additional_passage?.trim() || null,
    diagram_url: null,
    source_thread_ids: ids,
  }))

  const { error } = await supabase.from('user_qa_questions').insert(rows)

  if (error) return { error: new Error(error.message), inserted: 0 }
  return { error: null, inserted: rows.length }
}

/** 과목별 문항 개수(탭에서 과목 목록용) */
export async function fetchUserQaSubjectCounts(userId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('user_qa_questions').select('subject_id').eq('user_id', userId)
  if (error) throw new Error(error.message)
  const m = new Map<string, number>()
  for (const row of data ?? []) {
    const sid = (row as { subject_id: string }).subject_id
    m.set(sid, (m.get(sid) ?? 0) + 1)
  }
  return m
}

/** 과목별 내 생성 문항 전부(드릴 풀 구성용) */
export async function fetchUserQaQuestionsForSubject(
  userId: string,
  subjectId: string,
): Promise<UserQaQuestionRow[]> {
  const { data, error } = await supabase
    .from('user_qa_questions')
    .select('*')
    .eq('user_id', userId)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as UserQaQuestionRow[]
}

export async function fetchUserQaQuestionById(id: string): Promise<UserQaQuestionRow | null> {
  const { data, error } = await supabase.from('user_qa_questions').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data ?? null) as UserQaQuestionRow | null
}

export function filterUserQaRows(
  rows: UserQaQuestionRow[],
  filters: { categoryLabels: string[]; tags: string[] },
): UserQaQuestionRow[] {
  let out = rows
  if (filters.categoryLabels.length > 0) {
    const set = new Set(filters.categoryLabels.map((c) => c.trim()).filter(Boolean))
    out = out.filter((r) => {
      const c = r.category_label?.trim()
      return c != null && c.length > 0 && set.has(c)
    })
  }
  if (filters.tags.length > 0) {
    const tagSet = new Set(filters.tags.map((t) => t.trim()).filter(Boolean))
    out = out.filter((r) => {
      const ts = r.tags ?? []
      return ts.some((t) => tagSet.has(String(t).trim()))
    })
  }
  return out
}

/** questions_bank_results 없이 클라이언트 채점 (내 문제함 드릴) */
export function gradeUserQaAnswer(
  row: UserQaQuestionRow,
  userAnswer: string,
): { isCorrect: boolean; answerMatches: boolean } {
  const u = userAnswer.trim()
  const ca = row.answer.trim()
  if (!u || !ca) return { isCorrect: false, answerMatches: false }

  if (row.kind === 'multiple_choice') {
    if (u === ca) return { isCorrect: true, answerMatches: true }
    const nu = parseInt(u, 10)
    const nc = parseInt(ca, 10)
    if (!Number.isNaN(nu) && !Number.isNaN(nc) && nu === nc) return { isCorrect: true, answerMatches: true }
    let opts: { id?: unknown; text?: unknown }[] = []
    if (row.options != null) {
      const raw = row.options
      const v = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
      if (Array.isArray(v)) opts = v as { id?: unknown; text?: unknown }[]
    }
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
    const textById = (id: string) => {
      const o = opts.find((x) => String(x.id) === id)
      return o?.text != null ? String(o.text) : ''
    }
    if (norm(u) === norm(ca)) return { isCorrect: true, answerMatches: true }
    if (norm(textById(u)) === norm(ca) || norm(u) === norm(textById(String(nc)))) {
      return { isCorrect: true, answerMatches: true }
    }
    return { isCorrect: false, answerMatches: false }
  }

  if (row.kind === 'ox') {
    const norm = (s: string) => s.trim().toUpperCase().replace(/[^OX]/g, '')
    const nu = norm(u).slice(0, 1)
    const nc = norm(ca).slice(0, 1)
    if (nu && nc && nu === nc) return { isCorrect: true, answerMatches: true }
    return { isCorrect: false, answerMatches: false }
  }

  const u2 = u.toLowerCase()
  const c2 = ca.toLowerCase()
  return { isCorrect: u2 === c2, answerMatches: u2 === c2 }
}
