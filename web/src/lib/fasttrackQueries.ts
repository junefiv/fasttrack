import { supabase } from './supabase'
import type {
  FasttrackDrillProblemRow,
  FasttrackMockExamCatalogRow,
  FasttrackMockExamRow,
  FasttrackProblemRow,
  FasttrackStudentStatRow,
  FasttrackTestResultRow,
  FasttrackUserAnswerRow,
  SubjectRow,
} from '../types/fasttrack'

export async function fetchSubjects(): Promise<SubjectRow[]> {
  const { data, error } = await supabase.from('subjects').select('id,name,category').order('name')
  if (error) throw error
  return (data ?? []) as SubjectRow[]
}

export async function fetchMockExams(subjectId?: string): Promise<FasttrackMockExamRow[]> {
  let q = supabase.from('fasttrack_mock_exams').select('*').order('exam_date', { ascending: false })
  if (subjectId) q = q.eq('subject_id', subjectId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as FasttrackMockExamRow[]
}

export async function fetchMockExamCatalog(subjectId: string): Promise<FasttrackMockExamCatalogRow[]> {
  const { data, error } = await supabase
    .from('fasttrack_mock_exam_catalog')
    .select('id,subject_id,slug,title,description,sort_order,linked_mock_exam_id')
    .eq('subject_id', subjectId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as FasttrackMockExamCatalogRow[]
}

export async function fetchMockExamCatalogById(catalogId: string): Promise<FasttrackMockExamCatalogRow | null> {
  const { data, error } = await supabase
    .from('fasttrack_mock_exam_catalog')
    .select('id,subject_id,slug,title,description,sort_order,linked_mock_exam_id')
    .eq('id', catalogId)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as FasttrackMockExamCatalogRow | null
}

/** 응시 화면용: 카탈로그 문항 본문(번호·지시·지문·선지) + 채점용 answer */
export async function fetchCatalogProblemsForTake(catalogId: string): Promise<
  {
    problem_id: string
    question_number: number
    instruction: string | null
    content: string | null
    options: unknown
    answer: number
  }[]
> {
  const { data, error } = await supabase
    .from('fasttrack_mock_exam_catalog_problems')
    .select('problem_id, question_number, instruction, content, options, answer')
    .eq('catalog_id', catalogId)
    .order('question_number', { ascending: true })
  if (error) throw error
  return (data ?? []) as {
    problem_id: string
    question_number: number
    instruction: string | null
    content: string | null
    options: unknown
    answer: number
  }[]
}

export async function fetchMockExam(examId: string): Promise<FasttrackMockExamRow | null> {
  const { data, error } = await supabase.from('fasttrack_mock_exams').select('*').eq('id', examId).maybeSingle()
  if (error) throw error
  return data as FasttrackMockExamRow | null
}

export async function fetchProblemsForExam(mockExamId: string): Promise<FasttrackProblemRow[]> {
  const { data, error } = await supabase
    .from('fasttrack_problems')
    .select('*')
    .eq('mock_exam_id', mockExamId)
    .order('problem_number', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as FasttrackProblemRow[]
}

export async function fetchProblem(problemId: string): Promise<FasttrackProblemRow | null> {
  const { data, error } = await supabase.from('fasttrack_problems').select('*').eq('id', problemId).maybeSingle()
  if (error) throw error
  return data as FasttrackProblemRow | null
}

export async function fetchDrillProblems(ids: string[]): Promise<FasttrackDrillProblemRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('fasttrack_drill_problems').select('*').in('id', ids)
  if (error) throw error
  const list = (data ?? []) as FasttrackDrillProblemRow[]
  const order = new Map(ids.map((id, i) => [id, i]))
  return list.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

export async function fetchRecommendedDrills(limit = 6): Promise<FasttrackDrillProblemRow[]> {
  const { data, error } = await supabase.from('fasttrack_drill_problems').select('*').limit(limit)
  if (error) throw error
  return (data ?? []) as FasttrackDrillProblemRow[]
}

export async function fetchDrillsForSubject(
  subjectId: string,
  limit = 8,
): Promise<FasttrackDrillProblemRow[]> {
  const { data, error } = await supabase
    .from('fasttrack_drill_problems')
    .select('*')
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as FasttrackDrillProblemRow[]
}

export async function fetchChapterName(chapterId: string): Promise<string | null> {
  const { data, error } = await supabase.from('fasttrack_chapters').select('name').eq('id', chapterId).maybeSingle()
  if (error) throw error
  return (data as { name: string } | null)?.name ?? null
}

export async function fetchChapterNamesMap(ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))]
  if (uniq.length === 0) return new Map()
  const { data, error } = await supabase.from('fasttrack_chapters').select('id,name').in('id', uniq)
  if (error) throw error
  const m = new Map<string, string>()
  for (const row of (data ?? []) as { id: string; name: string }[]) m.set(row.id, row.name)
  return m
}

export async function insertDrillFromProblem(
  problemId: string,
  versionType: 'upper' | 'lower',
): Promise<FasttrackDrillProblemRow> {
  const p = await fetchProblem(problemId)
  if (!p) throw new Error('원본 문제를 찾을 수 없습니다.')

  const difficulty =
    versionType === 'upper'
      ? p.difficulty === 'easy'
        ? 'medium'
        : 'hard'
      : p.difficulty === 'hard'
        ? 'medium'
        : 'easy'

  const row = {
    parent_problem_id: p.id,
    version_type: versionType,
    subject_id: p.subject_id,
    chapter_id: p.chapter_id,
    section_id: p.section_id,
    problem_type: p.problem_type,
    difficulty,
    question_text: p.question_text,
    passage: p.passage,
    reference_view: p.reference_view,
    choices: p.choices,
    correct_answer: p.correct_answer,
    explanation: p.explanation,
  }

  const { data, error } = await supabase.from('fasttrack_drill_problems').insert(row).select('*').single()
  if (error) throw error
  return data as FasttrackDrillProblemRow
}

export async function fetchTestResult(resultId: string): Promise<FasttrackTestResultRow | null> {
  const { data, error } = await supabase.from('fasttrack_test_results').select('*').eq('id', resultId).maybeSingle()
  if (error) throw error
  return data as FasttrackTestResultRow | null
}

export async function fetchUserAnswersForResult(resultId: string): Promise<FasttrackUserAnswerRow[]> {
  const { data, error } = await supabase
    .from('fasttrack_user_answers')
    .select('*')
    .eq('result_id', resultId)
    .order('answered_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as FasttrackUserAnswerRow[]
}

export async function fetchProblemsByIds(ids: string[]): Promise<Map<string, FasttrackProblemRow>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('fasttrack_problems').select('*').in('id', ids)
  if (error) throw error
  const m = new Map<string, FasttrackProblemRow>()
  for (const row of (data ?? []) as FasttrackProblemRow[]) m.set(row.id, row)
  return m
}

export async function fetchDrillByIdsMap(ids: string[]): Promise<Map<string, FasttrackDrillProblemRow>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await supabase.from('fasttrack_drill_problems').select('*').in('id', ids)
  if (error) throw error
  const m = new Map<string, FasttrackDrillProblemRow>()
  for (const row of (data ?? []) as FasttrackDrillProblemRow[]) m.set(row.id, row)
  return m
}

export async function submitMockSession(params: {
  userId: string
  mockExamId: string
  timeSpentSec: number
  problemRows: FasttrackProblemRow[]
  answers: Record<string, string>
}): Promise<{ resultId: string }> {
  const { userId, mockExamId, timeSpentSec, problemRows, answers } = params
  let correct = 0
  const total = problemRows.length

  for (const p of problemRows) {
    const ua = (answers[p.id] ?? '').trim()
    const ok = ua === String(p.correct_answer).trim()
    if (ok) correct += 1
  }

  const score = total > 0 ? Math.round((correct * 100) / total) : 0
  const completed_at = new Date().toISOString()
  const resultId = crypto.randomUUID()

  const { error: rErr } = await supabase.from('fasttrack_test_results').insert({
    id: resultId,
    user_id: userId,
    test_type: 'mock',
    reference_id: mockExamId,
    score,
    correct_count: correct,
    total_questions: total,
    time_spent_sec: timeSpentSec,
    completed_at,
  })
  if (rErr) throw rErr

  const answerRows = problemRows.map((p) => {
    const ua = (answers[p.id] ?? '').trim()
    const ok = ua === String(p.correct_answer).trim()
    return {
      id: crypto.randomUUID(),
      user_id: userId,
      result_id: resultId,
      problem_id: p.id,
      is_mock: true,
      user_answer: ua || '(미응답)',
      is_correct: ok,
    }
  })

  const { error: aErr } = await supabase.from('fasttrack_user_answers').insert(answerRows)
  if (aErr) throw aErr

  return { resultId }
}

export async function submitDrillSession(params: {
  userId: string
  drillProblemIds: string[]
  leaderDrillId: string
  timeSpentSec: number
  drillRows: FasttrackDrillProblemRow[]
  answers: Record<string, string>
}): Promise<{ resultId: string }> {
  const { userId, leaderDrillId, timeSpentSec, drillRows, answers } = params
  let correct = 0
  const total = drillRows.length

  for (const p of drillRows) {
    const ua = (answers[p.id] ?? '').trim()
    const ok = ua === String(p.correct_answer).trim()
    if (ok) correct += 1
  }

  const score = total > 0 ? Math.round((correct * 100) / total) : 0
  const completed_at = new Date().toISOString()
  const resultId = crypto.randomUUID()

  const { error: rErr } = await supabase.from('fasttrack_test_results').insert({
    id: resultId,
    user_id: userId,
    test_type: 'drill',
    reference_id: leaderDrillId,
    score,
    correct_count: correct,
    total_questions: total,
    time_spent_sec: timeSpentSec,
    completed_at,
  })
  if (rErr) throw rErr

  const answerRows = drillRows.map((p) => {
    const ua = (answers[p.id] ?? '').trim()
    const ok = ua === String(p.correct_answer).trim()
    return {
      id: crypto.randomUUID(),
      user_id: userId,
      result_id: resultId,
      problem_id: p.id,
      is_mock: false,
      user_answer: ua || '(미응답)',
      is_correct: ok,
    }
  })

  const { error: aErr } = await supabase.from('fasttrack_user_answers').insert(answerRows)
  if (aErr) throw aErr

  return { resultId }
}

/** 사용자 모의고사 응시 이력 */
export async function fetchMockTestResultsForUser(userId: string): Promise<FasttrackTestResultRow[]> {
  const { data, error } = await supabase
    .from('fasttrack_test_results')
    .select('*')
    .eq('user_id', userId)
    .eq('test_type', 'mock')
    .order('completed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FasttrackTestResultRow[]
}

/** 백분위 계산용 전체 모의고사 점수 분포 */
export async function fetchAllMockTestScoresRaw(): Promise<{ reference_id: string; score: number }[]> {
  const { data, error } = await supabase
    .from('fasttrack_test_results')
    .select('reference_id,score')
    .eq('test_type', 'mock')
  if (error) throw error
  return (data ?? []) as { reference_id: string; score: number }[]
}

/** 인강 세션 총 개수(수강률 분모) */
export async function fetchLectureSessionCount(): Promise<number> {
  const { count, error } = await supabase
    .from('lecture_sessions')
    .select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

/** 사용자 전체 학습 통계 행(챕터·일자별 누적). 대시보드에서 과목 합산에 사용 */
export async function fetchStudentStatsForUser(userId: string): Promise<FasttrackStudentStatRow[]> {
  const { data, error } = await supabase
    .from('fasttrack_student_stats')
    .select('*')
    .eq('user_id', userId)
    .order('analysis_date', { ascending: false })
  if (error) throw error
  return (data ?? []) as FasttrackStudentStatRow[]
}

export async function fetchTopWeakness(
  userId: string,
  limit = 3,
  subjectId?: string,
): Promise<FasttrackStudentStatRow[]> {
  let q = supabase
    .from('fasttrack_student_stats')
    .select('*')
    .eq('user_id', userId)
    .order('weakness_score', { ascending: false })
    .limit(limit)
  if (subjectId) q = q.eq('subject_id', subjectId)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as FasttrackStudentStatRow[]
}

export async function fetchRecentTestResults(userId: string, days = 30): Promise<FasttrackTestResultRow[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const { data, error } = await supabase
    .from('fasttrack_test_results')
    .select('*')
    .eq('user_id', userId)
    .gte('completed_at', since.toISOString())
    .order('completed_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as FasttrackTestResultRow[]
}

export async function fetchAvgScoreForExam(mockExamId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('fasttrack_test_results')
    .select('score')
    .eq('test_type', 'mock')
    .eq('reference_id', mockExamId)
  if (error) throw error
  const rows = data as { score: number }[] | null
  if (!rows?.length) return null
  const sum = rows.reduce((a, r) => a + r.score, 0)
  return Math.round((sum * 10) / rows.length) / 10
}

export async function fetchUserBestScoreForExam(userId: string, mockExamId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('fasttrack_test_results')
    .select('score')
    .eq('user_id', userId)
    .eq('test_type', 'mock')
    .eq('reference_id', mockExamId)
    .order('score', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  const row = data as { score: number } | null
  return row?.score ?? null
}

export type BankFilters = {
  subjectId?: string
  chapterId?: string
  sectionId?: string
  problemType?: string
  difficulty?: string
  search?: string
}

export async function fetchProblemsBank(filters: BankFilters): Promise<FasttrackProblemRow[]> {
  let q = supabase.from('fasttrack_problems').select('*').order('created_at', { ascending: false })
  if (filters.subjectId) q = q.eq('subject_id', filters.subjectId)
  if (filters.chapterId) q = q.eq('chapter_id', filters.chapterId)
  if (filters.sectionId) q = q.eq('section_id', filters.sectionId)
  if (filters.problemType) q = q.eq('problem_type', filters.problemType)
  if (filters.difficulty) q = q.eq('difficulty', filters.difficulty)
  const { data, error } = await q
  if (error) throw error
  let rows = (data ?? []) as FasttrackProblemRow[]
  if (filters.search?.trim()) {
    const s = filters.search.trim().toLowerCase()
    rows = rows.filter(
      (p) =>
        p.question_text.toLowerCase().includes(s) ||
        (p.passage && p.passage.toLowerCase().includes(s)),
    )
  }
  return rows
}

export async function fetchChaptersForSubject(subjectId: string) {
  const { data, error } = await supabase.from('fasttrack_chapters').select('*').eq('subject_id', subjectId)
  if (error) throw error
  return data ?? []
}

export async function fetchSectionsForSubject(subjectId: string) {
  const { data, error } = await supabase.from('fasttrack_sections').select('*').eq('subject_id', subjectId)
  if (error) throw error
  return data ?? []
}
