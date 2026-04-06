import { supabase } from './supabase'
import type { LectureChatTurn } from './gemini'
import type { LectureQuestionThread } from '../types/lectureQuestion'

export type UserLectureQaThreadRow = {
  id: string
  user_id: string
  subject_id: string
  lecture_id: string
  instructor_name: string
  lecture_session_id: string | null
  context_kind: 'video' | 'ebook'
  context_at_sec: number
  ebook_highlight: string | null
  ebook_highlight_page: number | null
  ebook_pdf_url: string | null
  messages: unknown
  created_at: string
  updated_at: string
}

function parseMessages(raw: unknown): LectureChatTurn[] {
  if (!Array.isArray(raw)) return []
  const out: LectureChatTurn[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const role = (x as { role?: unknown }).role
    const text = (x as { text?: unknown }).text
    if (role !== 'user' && role !== 'model') continue
    if (typeof text !== 'string') continue
    out.push({ role, text })
  }
  return out
}

export function userLectureQaRowToThread(row: UserLectureQaThreadRow): LectureQuestionThread {
  return {
    id: row.id,
    contextAtSec: row.context_at_sec,
    contextKind: row.context_kind,
    ebookHighlight: row.ebook_highlight ?? undefined,
    ebookHighlightPage: row.ebook_highlight_page ?? undefined,
    ebookPdfUrl: row.ebook_pdf_url ?? undefined,
    messages: parseMessages(row.messages),
  }
}

/** FK용 최소 행 — 이미 있으면 무시 */
export async function ensureFasttrackUserExists(userId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('fasttrack_users').insert({ id: userId })
  if (!error) return { error: null }
  const code = (error as { code?: string }).code
  if (code === '23505') return { error: null }
  return { error: new Error(error.message) }
}

export async function fetchUserLectureQaThreadsForSession(
  userId: string,
  lectureId: string,
  lectureSessionId: string,
): Promise<UserLectureQaThreadRow[]> {
  const { data, error } = await supabase
    .from('user_lecture_qa_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('lecture_id', lectureId)
    .eq('lecture_session_id', lectureSessionId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as UserLectureQaThreadRow[]
}

/** 아카이브: 강좌·회차 메타와 함께 사용자 전체 Q&A 스레드 */
export type UserLectureQaArchiveRow = UserLectureQaThreadRow & {
  lectures?: { id: string; title: string; subject_id: string; instructor: string } | null
  lecture_sessions?: { id: string; title: string } | null
}

export async function fetchUserLectureQaThreadsForArchive(userId: string): Promise<UserLectureQaArchiveRow[]> {
  const { data, error } = await supabase
    .from('user_lecture_qa_threads')
    .select(
      `
      *,
      lectures ( id, title, subject_id, instructor ),
      lecture_sessions ( id, title )
    `,
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as UserLectureQaArchiveRow[]
}

export async function insertUserLectureQaThread(input: {
  userId: string
  lectureId: string
  lectureSessionId: string
  thread: LectureQuestionThread
}): Promise<{ error: Error | null }> {
  const { error: uerr } = await ensureFasttrackUserExists(input.userId)
  if (uerr) return { error: uerr }

  const { error } = await supabase.from('user_lecture_qa_threads').insert({
    id: input.thread.id,
    user_id: input.userId,
    lecture_id: input.lectureId,
    lecture_session_id: input.lectureSessionId,
    context_kind: input.thread.contextKind,
    context_at_sec: Math.floor(input.thread.contextAtSec),
    ebook_highlight: input.thread.ebookHighlight ?? null,
    ebook_highlight_page: input.thread.ebookHighlightPage ?? null,
    ebook_pdf_url: input.thread.ebookPdfUrl ?? null,
    messages: input.thread.messages,
  })

  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function updateUserLectureQaThreadMessages(input: {
  userId: string
  threadId: string
  messages: LectureChatTurn[]
}): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('user_lecture_qa_threads')
    .update({ messages: input.messages })
    .eq('id', input.threadId)
    .eq('user_id', input.userId)

  if (error) return { error: new Error(error.message) }
  return { error: null }
}

/** `user_lecture_qa_threads` 행 삭제 — 본인 `user_id` 행만 삭제 */
export async function deleteUserLectureQaThread(input: {
  userId: string
  threadId: string
}): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('user_lecture_qa_threads')
    .delete()
    .eq('id', input.threadId)
    .eq('user_id', input.userId)

  if (error) return { error: new Error(error.message) }
  return { error: null }
}

/** 여러 행 일괄 삭제 — 모두 본인 `user_id` 인 경우만 */
export async function deleteUserLectureQaThreads(input: {
  userId: string
  threadIds: string[]
}): Promise<{ error: Error | null }> {
  const ids = [...new Set(input.threadIds)].filter((x) => x.length > 0)
  if (ids.length === 0) return { error: null }

  const { error } = await supabase
    .from('user_lecture_qa_threads')
    .delete()
    .eq('user_id', input.userId)
    .in('id', ids)

  if (error) return { error: new Error(error.message) }
  return { error: null }
}
