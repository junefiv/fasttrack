import { supabase } from './supabase'
import { isSupabaseMissingRelationError } from './unknownError'
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

/** 응시 화면용: 본문(content)·도식(diagram, diagram_url)·발문·지문·선지 + 채점용 answer */
export async function fetchCatalogProblemsForTake(catalogId: string): Promise<
  {
    problem_id: string
    question_number: number
    instruction: string | null
    content: string | null
    additional_passage: string | null
    diagram: string | null
    diagram_url: string | null
    options: unknown
    answer: number
  }[]
> {
  const { data, error } = await supabase
    .from('fasttrack_mock_exam_catalog_problems')
    .select(
      'problem_id, question_number, instruction, content, additional_passage, diagram, diagram_url, options, answer',
    )
    .eq('catalog_id', catalogId)
    .order('question_number', { ascending: true })
  if (error) throw error
  return (data ?? []) as {
    problem_id: string
    question_number: number
    instruction: string | null
    content: string | null
    additional_passage: string | null
    diagram: string | null
    diagram_url: string | null
    options: unknown
    answer: number
  }[]
}

export type CatalogProblemExamAggregateRow = {
  catalogId: string
  title: string
  subject_id: string
  correct: number
  total: number
}

/** 카탈로그 모의 문항 제출(fasttrack_mock_exam_catalog_problem_exam_results)을 시험 시리즈(카탈로그)별로 집계 */
export async function fetchCatalogProblemExamAggregatesForUser(
  userId: string,
): Promise<CatalogProblemExamAggregateRow[]> {
  const { data: results, error: e1 } = await supabase
    .from('fasttrack_mock_exam_catalog_problem_exam_results')
    .select('is_correct, problem_id')
    .eq('user_id', userId)
  if (e1) throw e1
  const rows = (results ?? []) as { is_correct: boolean; problem_id: string }[]
  if (rows.length === 0) return []

  const problemIds = [...new Set(rows.map((r) => r.problem_id))]
  const { data: probs, error: e2 } = await supabase
    .from('fasttrack_mock_exam_catalog_problems')
    .select('problem_id, catalog_id')
    .in('problem_id', problemIds)
  if (e2) throw e2

  const probRows = (probs ?? []) as { problem_id: string; catalog_id: string }[]
  const catalogIds = [...new Set(probRows.map((p) => p.catalog_id))]
  if (catalogIds.length === 0) return []

  const { data: cats, error: e3 } = await supabase
    .from('fasttrack_mock_exam_catalog')
    .select('id, title, subject_id')
    .in('id', catalogIds)
  if (e3) throw e3

  const problemToCatalog = new Map(probRows.map((p) => [p.problem_id, p.catalog_id]))
  const catalogMeta = new Map(
    (cats ?? []).map((c) => [
      c.id as string,
      { title: c.title as string, subject_id: c.subject_id as string },
    ]),
  )

  const agg = new Map<string, { correct: number; total: number; title: string; subject_id: string }>()
  for (const r of rows) {
    const cid = problemToCatalog.get(r.problem_id)
    if (!cid) continue
    const meta = catalogMeta.get(cid)
    if (!meta) continue
    let a = agg.get(cid)
    if (!a) {
      a = { correct: 0, total: 0, title: meta.title, subject_id: meta.subject_id }
    }
    a.total += 1
    if (r.is_correct) a.correct += 1
    agg.set(cid, a)
  }

  return [...agg.entries()].map(([catalogId, v]) => ({
    catalogId,
    title: v.title,
    subject_id: v.subject_id,
    correct: v.correct,
    total: v.total,
  }))
}

/** 카탈로그 모의고사 현황: 시험(카탈로그)별 전체 문항 수·제출·최신 제출 기준 맞춘 문항 수 */
export type CatalogMockDashboardRow = {
  catalogId: string
  title: string
  subject_id: string
  problemsInCatalog: number
  submissionsCorrect: number
  submissionsTotal: number
  latestCorrectDistinct: number
  latestAttemptedDistinct: number
}

/** 문항별 최신 제출 1건 + 메타(유형·태그·지문 미리보기) — 코치 상세·강약점 집계용 */
export type CatalogMockProblemLatestRow = {
  catalogId: string
  catalogTitle: string
  subjectId: string
  problemId: string
  questionNumber: number
  isCorrect: boolean
  categoryLabel: string | null
  tags: string[]
  instructionPreview: string
}

export type CatalogMockCoachBundle = {
  dashboard: CatalogMockDashboardRow[]
  problemLatest: CatalogMockProblemLatestRow[]
}

function parseCatalogTags(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return []
    if (s.startsWith('[')) {
      try {
        const j = JSON.parse(s) as unknown
        if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean)
      } catch {
        /* ignore */
      }
    }
    return [s]
  }
  return []
}

function catalogInstructionPreview(html: string | null | undefined, maxChars: number): string {
  if (!html) return ''
  const t = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars)}…`
}

export async function fetchCatalogMockCoachBundleForUser(userId: string): Promise<CatalogMockCoachBundle> {
  const { data: results, error: e1 } = await supabase
    .from('fasttrack_mock_exam_catalog_problem_exam_results')
    .select('problem_id, is_correct, submitted_at')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
  if (e1) throw e1
  const rows = (results ?? []) as { problem_id: string; is_correct: boolean; submitted_at: string }[]
  if (rows.length === 0) return { dashboard: [], problemLatest: [] }

  const latestByProblem = new Map<string, boolean>()
  for (const r of rows) {
    if (!latestByProblem.has(r.problem_id)) latestByProblem.set(r.problem_id, r.is_correct)
  }

  const problemIds = [...latestByProblem.keys()]
  const { data: probs, error: e2 } = await supabase
    .from('fasttrack_mock_exam_catalog_problems')
    .select('problem_id, catalog_id, question_number, category_label, tags, instruction')
    .in('problem_id', problemIds)
  if (e2) throw e2
  const probRows = (probs ?? []) as {
    problem_id: string
    catalog_id: string
    question_number: number | null
    category_label: string | null
    tags: unknown
    instruction: string | null
  }[]

  const problemToCatalog = new Map(probRows.map((p) => [p.problem_id, p.catalog_id]))
  const probDetail = new Map(probRows.map((p) => [p.problem_id, p]))
  const catalogIds = [...new Set(probRows.map((p) => p.catalog_id))]

  const { data: cats, error: e3 } = await supabase
    .from('fasttrack_mock_exam_catalog')
    .select('id, title, subject_id')
    .in('id', catalogIds)
  if (e3) throw e3
  const catalogMeta = new Map(
    (cats ?? []).map((c) => [
      c.id as string,
      { title: c.title as string, subject_id: c.subject_id as string },
    ]),
  )

  const { data: allProbsForCatalog, error: e4 } = await supabase
    .from('fasttrack_mock_exam_catalog_problems')
    .select('catalog_id')
    .in('catalog_id', catalogIds)
  if (e4) throw e4
  const problemsInCatalogCount = new Map<string, number>()
  for (const row of (allProbsForCatalog ?? []) as { catalog_id: string }[]) {
    problemsInCatalogCount.set(
      row.catalog_id,
      (problemsInCatalogCount.get(row.catalog_id) ?? 0) + 1,
    )
  }

  type Acc = {
    title: string
    subject_id: string
    submissionsCorrect: number
    submissionsTotal: number
    latestCorrect: number
    latestAttempted: number
  }
  const byCat = new Map<string, Acc>()

  for (const r of rows) {
    const cid = problemToCatalog.get(r.problem_id)
    if (!cid) continue
    const meta = catalogMeta.get(cid)
    if (!meta) continue
    let a = byCat.get(cid)
    if (!a) {
      a = {
        title: meta.title,
        subject_id: meta.subject_id,
        submissionsCorrect: 0,
        submissionsTotal: 0,
        latestCorrect: 0,
        latestAttempted: 0,
      }
      byCat.set(cid, a)
    }
    a.submissionsTotal += 1
    if (r.is_correct) a.submissionsCorrect += 1
  }

  for (const [pid, isCorrect] of latestByProblem) {
    const cid = problemToCatalog.get(pid)
    if (!cid) continue
    const meta = catalogMeta.get(cid)
    if (!meta) continue
    const a = byCat.get(cid)
    if (!a) continue
    a.latestAttempted += 1
    if (isCorrect) a.latestCorrect += 1
  }

  const dashboard: CatalogMockDashboardRow[] = [...byCat.entries()].map(([catalogId, v]) => ({
    catalogId,
    title: v.title,
    subject_id: v.subject_id,
    problemsInCatalog: problemsInCatalogCount.get(catalogId) ?? 0,
    submissionsCorrect: v.submissionsCorrect,
    submissionsTotal: v.submissionsTotal,
    latestCorrectDistinct: v.latestCorrect,
    latestAttemptedDistinct: v.latestAttempted,
  }))

  const problemLatest: CatalogMockProblemLatestRow[] = []
  for (const [pid, isCorrect] of latestByProblem) {
    const pr = probDetail.get(pid)
    if (!pr) continue
    const cid = pr.catalog_id
    const meta = catalogMeta.get(cid)
    if (!meta) continue
    problemLatest.push({
      catalogId: cid,
      catalogTitle: meta.title,
      subjectId: meta.subject_id,
      problemId: pid,
      questionNumber: pr.question_number ?? 0,
      isCorrect,
      categoryLabel: pr.category_label,
      tags: parseCatalogTags(pr.tags),
      instructionPreview: catalogInstructionPreview(pr.instruction, 120),
    })
  }
  problemLatest.sort((a, b) => {
    const t = a.catalogTitle.localeCompare(b.catalogTitle, 'ko')
    if (t !== 0) return t
    return a.questionNumber - b.questionNumber
  })

  return { dashboard, problemLatest }
}

export async function fetchCatalogMockDashboardForUser(
  userId: string,
): Promise<CatalogMockDashboardRow[]> {
  const { dashboard } = await fetchCatalogMockCoachBundleForUser(userId)
  return dashboard
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
  const examMeta = await fetchMockExam(mockExamId)
  const catalogId = examMeta?.catalog_id ?? null

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
    catalog_id: catalogId,
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

/** 카탈로그(시리즈) 단위 모의고사 응시 이력 — fasttrack_test_results.catalog_id 기준 */
export async function fetchMockTestResultsForCatalog(
  userId: string,
  catalogId: string,
): Promise<FasttrackTestResultRow[]> {
  const { data, error } = await supabase
    .from('fasttrack_test_results')
    .select('*')
    .eq('user_id', userId)
    .eq('test_type', 'mock')
    .eq('catalog_id', catalogId)
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
  if (error) {
    if (isSupabaseMissingRelationError(error)) return 0
    throw error
  }
  return count ?? 0
}

/** 사용자 전체 학습 통계 행(챕터·일자별 누적). 대시보드에서 과목 합산에 사용 */
export async function fetchStudentStatsForUser(userId: string): Promise<FasttrackStudentStatRow[]> {
  const { data, error } = await supabase
    .from('fasttrack_student_stats')
    .select('*')
    .eq('user_id', userId)
    .order('analysis_date', { ascending: false })
  if (error) {
    if (isSupabaseMissingRelationError(error)) return []
    throw error
  }
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
  if (error) {
    if (isSupabaseMissingRelationError(error)) return []
    throw error
  }
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
