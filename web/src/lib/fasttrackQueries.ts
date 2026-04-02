import { supabase } from './supabase'
import { isSupabaseMissingRelationError, isSupabaseSchemaOrColumnError } from './unknownError'
import type {
  CatalogEbookPageNavContext,
  CatalogLectureCaptionNavContext,
  CatalogProblemInlineLearningRef,
  CatalogProblemLearningDeepLink,
  FasttrackDrillProblemRow,
  FasttrackMockExamCatalogRow,
  FasttrackMockExamRow,
  FasttrackProblemRow,
  FasttrackStudentStatRow,
  FasttrackTestResultRow,
  FasttrackUserAnswerRow,
  SubjectRow,
} from '../types/fasttrack'
import type { QuestionsBankRow } from '../types/questionsBank'

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
    .select('id,subject_id,slug,title,description,sort_order')
    .eq('subject_id', subjectId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as FasttrackMockExamCatalogRow[]
}

export async function fetchMockExamCatalogById(catalogId: string): Promise<FasttrackMockExamCatalogRow | null> {
  const { data, error } = await supabase
    .from('fasttrack_mock_exam_catalog')
    .select('id,subject_id,slug,title,description,sort_order')
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
    ebook_page_id: string | null
    lecture_caption_id: string | null
  }[]
> {
  // DB PK 컬럼은 `id`(일부 환경은 `problem_id`). PostgREST 별칭으로 앱 타입의 problem_id에 맞춤.
  // `diagram` 텍스트 컬럼이 없는 스키마도 지원(도식 URL만 diagram_url).
  const { data, error } = await supabase
    .from('fasttrack_mock_exam_catalog_problems')
    .select(
      'problem_id:id, question_number, instruction, content, additional_passage, diagram_url, options, answer, ebook_page_id, lecture_caption_id',
    )
    .eq('catalog_id', catalogId)
    .order('question_number', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as {
    problem_id: string
    question_number: number
    instruction: string | null
    content: string | null
    additional_passage: string | null
    diagram_url: string | null
    options: unknown
    answer: number
    ebook_page_id: string | null
    lecture_caption_id: string | null
  }[]
  return rows.map((r) => ({ ...r, diagram: null as string | null }))
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
    .select('problem_id:id, catalog_id')
    .in('id', problemIds)
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
    .select('problem_id:id, catalog_id, question_number, category_label, tags, instruction')
    .in('id', problemIds)
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

const CATALOG_EXAM_RESULTS_PAGE = 1000
const CATALOG_PROBLEM_ID_CHUNK = 200

function chunkStringIds(ids: string[], chunkSize: number): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += chunkSize) out.push(ids.slice(i, i + chunkSize))
  return out
}

/**
 * 카탈로그 모의 문항 제출 전 사용자 집계(프로토타입 RLS 전체 허용 전제).
 * catalogId → userId → 누적 correct/total (막대 차트·동료 분포와 동일하게 모든 제출 행 반영)
 */
export async function fetchCatalogExamAggregatesByCatalogAndUser(): Promise<
  Map<string, Map<string, { correct: number; total: number }>>
> {
  type ResultRow = { user_id: string; problem_id: string; is_correct: boolean }
  const results: ResultRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from('fasttrack_mock_exam_catalog_problem_exam_results')
      .select('user_id, problem_id, is_correct')
      .range(offset, offset + CATALOG_EXAM_RESULTS_PAGE - 1)
    if (error) throw error
    const batch = (data ?? []) as ResultRow[]
    results.push(...batch)
    if (batch.length < CATALOG_EXAM_RESULTS_PAGE) break
    offset += CATALOG_EXAM_RESULTS_PAGE
  }

  const problemToCatalog = new Map<string, string>()
  const problemIds = [...new Set(results.map((r) => r.problem_id))]
  for (const chunk of chunkStringIds(problemIds, CATALOG_PROBLEM_ID_CHUNK)) {
    if (chunk.length === 0) continue
    const { data, error } = await supabase
      .from('fasttrack_mock_exam_catalog_problems')
      .select('problem_id:id, catalog_id')
      .in('id', chunk)
    if (error) throw error
    for (const row of (data ?? []) as { problem_id: string; catalog_id: string }[]) {
      problemToCatalog.set(row.problem_id, row.catalog_id)
    }
  }

  const byCatalogUser = new Map<string, Map<string, { correct: number; total: number }>>()
  for (const r of results) {
    const catalogId = problemToCatalog.get(r.problem_id)
    if (!catalogId) continue
    let userMap = byCatalogUser.get(catalogId)
    if (!userMap) {
      userMap = new Map()
      byCatalogUser.set(catalogId, userMap)
    }
    let a = userMap.get(r.user_id)
    if (!a) {
      a = { correct: 0, total: 0 }
      userMap.set(r.user_id, a)
    }
    a.total += 1
    if (r.is_correct) a.correct += 1
  }

  return byCatalogUser
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

type EbookPageRow = {
  id: string
  lecture_session_id?: string | null
  page_number?: number | null
  resource_id?: string | null
  learning_resource_id?: string | null
}

type LectureCaptionRow = {
  id: string
  lecture_session_id: string
  start_sec: number
  text: string
}

export async function fetchCatalogProblemInlineRefsByProblemIds(
  problemIds: string[],
): Promise<Map<string, CatalogProblemInlineLearningRef>> {
  const out = new Map<string, CatalogProblemInlineLearningRef>()
  const ids = [...new Set(problemIds)].filter(Boolean)
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('fasttrack_mock_exam_catalog_problems')
    .select('problem_id:id, ebook_page_id, lecture_caption_id')
    .in('id', ids)

  if (error) {
    if (isSupabaseMissingRelationError(error) || isSupabaseSchemaOrColumnError(error)) return out
    throw error
  }
  for (const row of (data ?? []) as {
    problem_id: string
    ebook_page_id: string | null
    lecture_caption_id: string | null
  }[]) {
    if (!row.problem_id) continue
    out.set(row.problem_id, {
      ebook_page_id: typeof row.ebook_page_id === 'string' && row.ebook_page_id.trim() ? row.ebook_page_id.trim() : null,
      lecture_caption_id:
        typeof row.lecture_caption_id === 'string' && row.lecture_caption_id.trim()
          ? row.lecture_caption_id.trim()
          : null,
    })
  }
  return out
}

async function fetchDeepLinksForProblemEbookCaptionPairs(
  pairs: { problem_id: string; ebook_page_id: string; lecture_caption_id: string }[],
): Promise<Map<string, CatalogProblemLearningDeepLink>> {
  const out = new Map<string, CatalogProblemLearningDeepLink>()
  if (pairs.length === 0) return out

  const epIds = [...new Set(pairs.map((p) => p.ebook_page_id))]
  const capIds = [...new Set(pairs.map((p) => p.lecture_caption_id))]

  const [epRes, capRes] = await Promise.all([
    supabase.from('ebook_pages').select('*').in('id', epIds),
    supabase.from('lecture_captions').select('id, lecture_session_id, start_sec, text').in('id', capIds),
  ])

  if (epRes.error) {
    if (isSupabaseMissingRelationError(epRes.error)) return out
    throw epRes.error
  }
  if (capRes.error) throw capRes.error

  const epMap = new Map<string, EbookPageRow>()
  for (const r of (epRes.data ?? []) as EbookPageRow[]) epMap.set(r.id, r)
  const capMap = new Map<string, LectureCaptionRow>()
  for (const r of (capRes.data ?? []) as LectureCaptionRow[]) capMap.set(r.id, r)

  for (const p of pairs) {
    const ep = epMap.get(p.ebook_page_id)
    const cap = capMap.get(p.lecture_caption_id)
    if (!ep || !cap) continue
    const epSid = typeof ep.lecture_session_id === 'string' && ep.lecture_session_id.trim() ? ep.lecture_session_id.trim() : null
    if (!epSid || epSid !== cap.lecture_session_id) continue
    out.set(p.problem_id, {
      problem_id: p.problem_id,
      lecture_session_id: epSid,
      caption_start_sec: cap.start_sec,
      caption_text: cap.text,
      ebook_page_number: ebookRowPageNumber(ep),
      resource_id: ebookRowResourceId(ep),
    })
  }
  return out
}

function ebookRowResourceId(row: EbookPageRow): string | null {
  const a = row.resource_id ?? row.learning_resource_id
  if (typeof a === 'string' && a.trim()) return a.trim()
  return null
}

function ebookRowPageNumber(row: EbookPageRow): number {
  const n = row.page_number
  if (typeof n === 'number' && Number.isFinite(n) && n >= 1) return Math.floor(n)
  return 1
}

/**
 * 카탈로그 문항(`fasttrack_mock_exam_catalog_problems`)의 ebook_page_id·lecture_caption_id 로
 * 복습 딥링크(ebook_pages + lecture_captions, 동일 lecture_session 일 때만).
 */
export async function fetchCatalogProblemLearningLinks(
  problemIds: string[],
): Promise<Map<string, CatalogProblemLearningDeepLink>> {
  const ids = [...new Set(problemIds)].filter(Boolean)
  if (ids.length === 0) return new Map()

  const refs = await fetchCatalogProblemInlineRefsByProblemIds(ids)
  const pairs: { problem_id: string; ebook_page_id: string; lecture_caption_id: string }[] = []
  for (const id of ids) {
    const r = refs.get(id)
    if (r?.ebook_page_id && r?.lecture_caption_id) {
      pairs.push({ problem_id: id, ebook_page_id: r.ebook_page_id, lecture_caption_id: r.lecture_caption_id })
    }
  }
  return fetchDeepLinksForProblemEbookCaptionPairs(pairs)
}

/** @deprecated 별도 링크 테이블 없음 — `fetchCatalogProblemLearningLinks` 와 동일 */
export async function fetchCatalogProblemLearningLinksMerged(
  problemIds: string[],
): Promise<Map<string, CatalogProblemLearningDeepLink>> {
  return fetchCatalogProblemLearningLinks(problemIds)
}

function firstEmb<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

/** Map 조회·PostgREST .in() 용 (카탈로그에 대문자 UUID가 들어간 경우 대비) */
function normUuid(s: string): string {
  return s.trim().toLowerCase()
}

/** ebook_pages.id 배치 → 강의·교재·페이지 라벨·시청 URL용 컨텍스트
 *  PostgREST 중첩 embed 대신: ebook_pages → learning_resources → lectures 를 각각 조회해 합칩니다.
 */
export async function fetchEbookPageNavContexts(
  ebookPageIds: string[],
): Promise<Map<string, CatalogEbookPageNavContext>> {
  const ids = [...new Set(ebookPageIds.map(normUuid))].filter(Boolean)
  const out = new Map<string, CatalogEbookPageNavContext>()
  if (ids.length === 0) return out

  const { data: pageRows, error: pageErr } = await supabase
    .from('ebook_pages')
    .select('id, page_number, lecture_session_id, resource_id')
    .in('id', ids)

  if (pageErr) {
    if (isSupabaseMissingRelationError(pageErr) || isSupabaseSchemaOrColumnError(pageErr)) return out
    throw pageErr
  }

  const pages = (pageRows ?? []) as {
    id: string
    page_number: number | null
    lecture_session_id: string | null
    resource_id: string | null
  }[]

  const resourceIdSet = new Set<string>()
  for (const p of pages) {
    const r = typeof p.resource_id === 'string' && p.resource_id.trim() ? p.resource_id.trim() : ''
    if (r) resourceIdSet.add(r)
  }
  const resourceIds = [...resourceIdSet]

  type LrRow = { id: string; title: string | null; lecture_id: string | null }
  const lrById = new Map<string, LrRow>()
  if (resourceIds.length > 0) {
    const { data: lrData, error: lrErr } = await supabase
      .from('learning_resources')
      .select('id, title, lecture_id')
      .in('id', resourceIds)
    if (lrErr) {
      if (!isSupabaseMissingRelationError(lrErr) && !isSupabaseSchemaOrColumnError(lrErr)) throw lrErr
    } else {
      for (const r of (lrData ?? []) as LrRow[]) {
        if (r.id) lrById.set(r.id, r)
      }
    }
  }

  const lectureIdSet = new Set<string>()
  for (const r of lrById.values()) {
    const lid = typeof r.lecture_id === 'string' && r.lecture_id.trim() ? r.lecture_id.trim() : ''
    if (lid) lectureIdSet.add(lid)
  }
  const lectureIds = [...lectureIdSet]

  const lectureTitleById = new Map<string, string>()
  if (lectureIds.length > 0) {
    const { data: lecData, error: lecErr } = await supabase
      .from('lectures')
      .select('id, title')
      .in('id', lectureIds)
    if (lecErr) {
      if (!isSupabaseMissingRelationError(lecErr) && !isSupabaseSchemaOrColumnError(lecErr)) throw lecErr
    } else {
      for (const l of (lecData ?? []) as { id: string; title: string | null }[]) {
        if (l.id) lectureTitleById.set(l.id, (l.title ?? '').trim())
      }
    }
  }

  for (const p of pages) {
    const sid =
      typeof p.lecture_session_id === 'string' && p.lecture_session_id.trim()
        ? p.lecture_session_id.trim()
        : ''
    const rid = typeof p.resource_id === 'string' && p.resource_id.trim() ? p.resource_id.trim() : ''
    if (!p.id || !sid || !rid) continue

    const lr = lrById.get(rid)
    const lecId =
      lr && typeof lr.lecture_id === 'string' && lr.lecture_id.trim() ? lr.lecture_id.trim() : ''
    const lectureTitle = lecId ? lectureTitleById.get(lecId) ?? '' : ''
    const resourceTitle = (lr?.title ?? '').trim()

    const n = p.page_number
    const pageNum =
      typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1

    const key = normUuid(p.id)
    out.set(key, {
      ebook_page_id: key,
      lecture_session_id: sid,
      resource_id: rid,
      page_number: pageNum,
      lecture_title: lectureTitle,
      resource_title: resourceTitle,
      session_order: 0,
      session_title: '',
    })
  }
  return out
}

/** lecture_captions.id 배치 → 강의·회차·시각 라벨·시청 URL용 컨텍스트 */
export async function fetchLectureCaptionNavContexts(
  captionIds: string[],
): Promise<Map<string, CatalogLectureCaptionNavContext>> {
  const ids = [...new Set(captionIds)].filter(Boolean)
  const out = new Map<string, CatalogLectureCaptionNavContext>()
  if (ids.length === 0) return out

  const { data, error } = await supabase
    .from('lecture_captions')
    .select(
      `
      id,
      start_sec,
      lecture_session_id,
      lecture_sessions (
        session_order,
        title,
        lectures ( title )
      )
    `,
    )
    .in('id', ids)

  if (error) {
    if (isSupabaseMissingRelationError(error) || isSupabaseSchemaOrColumnError(error)) return out
    throw error
  }

  for (const raw of data ?? []) {
    const row = raw as {
      id: string
      start_sec: number | null
      lecture_session_id: string | null
      lecture_sessions:
        | {
            session_order: number | null
            title: string | null
            lectures: { title: string | null } | { title: string | null }[] | null
          }
        | {
            session_order: number | null
            title: string | null
            lectures: { title: string | null } | { title: string | null }[] | null
          }[]
        | null
    }
    const ls = firstEmb(row.lecture_sessions)
    const lecEmb = ls ? firstEmb(ls.lectures) : null
    const sid =
      typeof row.lecture_session_id === 'string' && row.lecture_session_id.trim()
        ? row.lecture_session_id.trim()
        : ''
    if (!sid) continue
    const t = row.start_sec
    const startSec = typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : 0
    out.set(row.id, {
      caption_id: row.id,
      lecture_session_id: sid,
      start_sec: startSec,
      lecture_title: lecEmb?.title?.trim() ?? '',
      session_order: typeof ls?.session_order === 'number' && Number.isFinite(ls.session_order) ? ls.session_order : 0,
      session_title: ls?.title?.trim() ?? '',
    })
  }
  return out
}

export function catalogEbookPageWatchPath(ctx: CatalogEbookPageNavContext): string {
  const q = new URLSearchParams()
  q.set('ebook', '1')
  q.set('resourceId', ctx.resource_id)
  q.set('page', String(ctx.page_number))
  return `/study/videos/watch/${ctx.lecture_session_id}?${q.toString()}`
}

export function catalogCaptionWatchPath(ctx: CatalogLectureCaptionNavContext): string {
  const q = new URLSearchParams()
  q.set('t', String(ctx.start_sec))
  return `/study/videos/watch/${ctx.lecture_session_id}?${q.toString()}`
}

/** 카탈로그 시리즈 내 문항번호 → 카탈로그 problem_id */
export async function fetchCatalogProblemIdsByQuestionNumber(catalogId: string): Promise<Map<number, string>> {
  const m = new Map<number, string>()
  const cid = catalogId.trim()
  if (!cid) return m

  const { data, error } = await supabase
    .from('fasttrack_mock_exam_catalog_problems')
    .select('problem_id:id, question_number')
    .eq('catalog_id', cid)

  if (error) {
    if (isSupabaseMissingRelationError(error)) return m
    throw error
  }
  for (const row of data ?? []) {
    const r = row as { problem_id: string; question_number: number }
    if (typeof r.question_number === 'number' && r.question_number >= 1 && r.problem_id) {
      m.set(r.question_number, r.problem_id)
    }
  }
  return m
}

/**
 * 모의고사 결과 화면용: user_answers.problem_id 는 fasttrack_problems.id 일 수 있고,
 * 카탈로그 문항 problem_id 와 다를 수 있음.
 * catalog_id + 응시 문항의 problem_number 로 카탈로그 행을 찾아
 * fasttrack_mock_exam_catalog_problems 의 ebook_page_id·lecture_caption_id 로 딥링크 생성.
 */
export async function fetchCatalogLearningLinksByExamProblemIds(params: {
  catalogId: string | null | undefined
  examProblems: Map<string, FasttrackProblemRow>
  examProblemIds: string[]
}): Promise<Map<string, CatalogProblemLearningDeepLink>> {
  const { catalogId, examProblems, examProblemIds } = params
  const ids = [...new Set(examProblemIds)].filter(Boolean)
  if (ids.length === 0) return new Map()

  const catalogQToPid =
    catalogId && String(catalogId).trim()
      ? await fetchCatalogProblemIdsByQuestionNumber(String(catalogId).trim())
      : new Map<number, string>()

  const inlineKeys = new Set<string>()
  for (const eid of ids) {
    const p = examProblems.get(eid)
    const n = p?.problem_number != null && p.problem_number > 0 ? p.problem_number : null
    const cp = n != null ? catalogQToPid.get(n) : undefined
    if (cp) inlineKeys.add(cp)
    inlineKeys.add(eid)
  }
  const inlineByPid = await fetchCatalogProblemInlineRefsByProblemIds([...inlineKeys])
  const fillPairs: { problem_id: string; ebook_page_id: string; lecture_caption_id: string }[] = []
  for (const eid of ids) {
    const p = examProblems.get(eid)
    const n = p?.problem_number != null && p.problem_number > 0 ? p.problem_number : null
    const cp = n != null ? catalogQToPid.get(n) : undefined
    const row = (cp ? inlineByPid.get(cp) : undefined) ?? inlineByPid.get(eid)
    if (row?.ebook_page_id && row?.lecture_caption_id) {
      fillPairs.push({
        problem_id: eid,
        ebook_page_id: row.ebook_page_id,
        lecture_caption_id: row.lecture_caption_id,
      })
    }
  }
  return fetchDeepLinksForProblemEbookCaptionPairs(fillPairs)
}

/** 응시 문항 id 기준으로 카탈로그 행에 저장된 ebook_page_id·lecture_caption_id (표시용) */
export async function fetchCatalogInlineLearningRefsForExamAnswers(params: {
  catalogId: string | null | undefined
  examProblems: Map<string, FasttrackProblemRow>
  examProblemIds: string[]
}): Promise<Map<string, CatalogProblemInlineLearningRef>> {
  const { catalogId, examProblems, examProblemIds } = params
  const ids = [...new Set(examProblemIds)].filter(Boolean)
  const empty = (): CatalogProblemInlineLearningRef => ({ ebook_page_id: null, lecture_caption_id: null })
  const out = new Map<string, CatalogProblemInlineLearningRef>()
  if (ids.length === 0) return out

  const catalogQToPid =
    catalogId && String(catalogId).trim()
      ? await fetchCatalogProblemIdsByQuestionNumber(String(catalogId).trim())
      : new Map<number, string>()

  const inlineKeys = new Set<string>()
  for (const eid of ids) {
    const p = examProblems.get(eid)
    const n = p?.problem_number != null && p.problem_number > 0 ? p.problem_number : null
    const cp = n != null ? catalogQToPid.get(n) : undefined
    if (cp) inlineKeys.add(cp)
    inlineKeys.add(eid)
  }
  const byPid = await fetchCatalogProblemInlineRefsByProblemIds([...inlineKeys])

  for (const eid of ids) {
    const p = examProblems.get(eid)
    const n = p?.problem_number != null && p.problem_number > 0 ? p.problem_number : null
    const cp = n != null ? catalogQToPid.get(n) : undefined
    const row = (cp ? byPid.get(cp) : undefined) ?? byPid.get(eid)
    out.set(eid, row ?? empty())
  }
  return out
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

  if (catalogId && problemRows.length > 0) {
    const ids = problemRows.map((p) => p.id)
    const { data: catProbRows, error: catErr } = await supabase
      .from('fasttrack_mock_exam_catalog_problems')
      .select('problem_id:id')
      .eq('catalog_id', catalogId)
      .in('id', ids)
    if (catErr) throw catErr
    const allowed = new Set((catProbRows ?? []).map((r) => (r as { problem_id: string }).problem_id))
    const catalogResultRows = problemRows
      .filter((p) => allowed.has(p.id))
      .map((p) => {
        const ua = (answers[p.id] ?? '').trim()
        const n = parseInt(ua, 10)
        const user_answer = Number.isFinite(n) ? n : 0
        return {
          user_id: userId,
          problem_id: p.id,
          user_answer,
          submitted_at: completed_at,
        }
      })
    if (catalogResultRows.length > 0) {
      const { error: cErr } = await supabase
        .from('fasttrack_mock_exam_catalog_problem_exam_results')
        .upsert(catalogResultRows, { onConflict: 'user_id,problem_id' })
      if (cErr) throw cErr
    }
  }

  return { resultId }
}

/**
 * 카탈로그 전용 응시(`/preview/:catalogId` + `fasttrack_mock_exam_catalog_problems` 문항) 종료 시
 * 문항별 선택을 `fasttrack_mock_exam_catalog_problem_exam_results`에 upsert합니다(동일 user·문항이면 수정).
 * `is_correct`는 DB 트리거가 `catalog_problems.answer`와 비교해 설정합니다.
 */
export async function submitCatalogProblemExamResults(params: {
  userId: string
  catalogId: string
  answers: Record<string, string>
  /** 각 시트의 `id` = 카탈로그 문항 PK(`id`; 레거시 스키마에서는 `problem_id`) */
  problemIds: string[]
}): Promise<void> {
  const { userId, catalogId, answers, problemIds } = params
  const ids = [...new Set(problemIds)].filter(Boolean)
  if (ids.length === 0) return

  const { data: catProbRows, error: catErr } = await supabase
    .from('fasttrack_mock_exam_catalog_problems')
    .select('problem_id:id')
    .eq('catalog_id', catalogId.trim())
    .in('id', ids)
  if (catErr) throw catErr
  const allowed = new Set((catProbRows ?? []).map((r) => (r as { problem_id: string }).problem_id))

  const submitted_at = new Date().toISOString()
  const rows = ids
    .filter((problem_id) => allowed.has(problem_id))
    .map((problem_id) => {
      const ua = (answers[problem_id] ?? '').trim()
      const n = parseInt(ua, 10)
      const user_answer = Number.isFinite(n) && n >= 1 && n <= 5 ? Math.floor(n) : 0
      return { user_id: userId, problem_id, user_answer, submitted_at }
    })

  if (rows.length === 0) return

  const { error } = await supabase
    .from('fasttrack_mock_exam_catalog_problem_exam_results')
    .upsert(rows, { onConflict: 'user_id,problem_id' })
  if (error) throw error
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

/** public.questions_bank 실제 컬럼(MCP list_tables verbose 기준). PK question_id, FK subject_id → subjects.id */
const QUESTIONS_BANK_SELECT =
  'question_id, subject_id, instruction, content, options, answer, explanation, category_label, tags, estimated_time, additional_passage, diagram, diagram_url, created_at, updated_at' as const

async function fetchQuestionsBankRowsForSubject(subjectId: string): Promise<QuestionsBankRow[]> {
  const { data, error } = await supabase
    .from('questions_bank')
    .select(QUESTIONS_BANK_SELECT)
    .eq('subject_id', subjectId)
  if (error) throw error
  return (data ?? []) as QuestionsBankRow[]
}

/** Pass-Nav·딥링크: 단일 문항 로드 */
export async function fetchQuestionsBankQuestionById(questionId: string): Promise<QuestionsBankRow | null> {
  const id = questionId.trim()
  if (!id) return null
  const { data, error } = await supabase.from('questions_bank').select(QUESTIONS_BANK_SELECT).eq('question_id', id).maybeSingle()
  if (error) {
    if (isSupabaseMissingRelationError(error)) return null
    throw error
  }
  return (data ?? null) as QuestionsBankRow | null
}

const questionsBankRowsCache = new Map<string, { fetchedAt: number; rows: QuestionsBankRow[] }>()
const QUESTIONS_BANK_ROWS_CACHE_MS = 25_000

async function getQuestionsBankRowsForSubjectCached(subjectId: string): Promise<QuestionsBankRow[]> {
  const now = Date.now()
  const hit = questionsBankRowsCache.get(subjectId)
  if (hit && now - hit.fetchedAt < QUESTIONS_BANK_ROWS_CACHE_MS) return hit.rows
  const rows = await fetchQuestionsBankRowsForSubject(subjectId)
  questionsBankRowsCache.set(subjectId, { fetchedAt: now, rows })
  return rows
}

function pickRandomElement<T>(items: T[]): T | null {
  if (items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)]!
}

/** DB에 `pick_questions_bank_question` RPC가 없을 때 동일 규칙으로 클라이언트에서 추첨 */
function pickQuestionsBankFromLoadedRows(
  rows: QuestionsBankRow[],
  excludeIds: string[],
  weakCategories: string[],
  weakTags: string[],
): QuestionsBankRow | null {
  const exclude = new Set(excludeIds)
  const pool = rows.filter((r) => !exclude.has(r.question_id))
  if (pool.length === 0) return null

  const hasWeakCat = weakCategories.length > 0
  const hasWeakTags = weakTags.length > 0
  const weakTagSet = new Set(weakTags)

  const prioritized = pool.filter((qb) => {
    const catMatch =
      hasWeakCat &&
      qb.category_label != null &&
      qb.category_label !== '' &&
      weakCategories.includes(qb.category_label)
    let tagMatch = false
    if (hasWeakTags && qb.tags && qb.tags.length > 0) {
      tagMatch = qb.tags.some((t) => weakTagSet.has(t))
    }
    return catMatch || tagMatch
  })

  const chosenPool = prioritized.length > 0 ? prioritized : pool
  return pickRandomElement(chosenPool)
}

export async function fetchQuestionsBankCountForSubject(subjectId: string): Promise<number> {
  const { count, error } = await supabase
    .from('questions_bank')
    .select('*', { count: 'exact', head: true })
    .eq('subject_id', subjectId)
  if (error) throw error
  return count ?? 0
}

/** DB에 pick_questions_bank_question RPC 없음(실제 프로젝트) — 과목 행 로드 후 클라이언트 추첨 */
export async function pickQuestionsBankQuestion(args: {
  subjectId: string
  excludeIds: string[]
  weakCategories: string[]
  weakTags: string[]
}): Promise<QuestionsBankRow | null> {
  const rows = await getQuestionsBankRowsForSubjectCached(args.subjectId)
  return pickQuestionsBankFromLoadedRows(
    rows,
    args.excludeIds,
    args.weakCategories,
    args.weakTags,
  )
}

/** @deprecated 이름 호환 — `pickQuestionsBankQuestion` 과 동일 */
export const pickQuestionsBankQuestionRpc = pickQuestionsBankQuestion

export type QuestionsBankSubjectStat = {
  subjectId: string
  correct: number
  total: number
}

/**
 * `questions_bank`의 과목별 문항 수(등록 여부). 문항이 아직 없는 과목(예: 영어) UI 구분용.
 * 행이 많을 수 있어 range로 페이지 순회.
 */
export async function fetchQuestionsBankQuestionCountsBySubject(): Promise<Record<string, number>> {
  const pageSize = 1000
  let from = 0
  const counts: Record<string, number> = {}
  for (;;) {
    const { data, error } = await supabase
      .from('questions_bank')
      .select('subject_id')
      .range(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data ?? []) as { subject_id: string }[]
    for (const r of rows) {
      const id = r.subject_id
      counts[id] = (counts[id] ?? 0) + 1
    }
    if (rows.length < pageSize) break
    from += pageSize
  }
  return counts
}

/**
 * 사용자별 문제은행 풀이를 `questions_bank.subject_id` 기준으로 집계.
 * (results → question_id → questions_bank.subject_id)
 */
export async function fetchQuestionsBankStatsBySubjectForUser(
  userId: string,
): Promise<QuestionsBankSubjectStat[]> {
  const { data: results, error: e1 } = await supabase
    .from('questions_bank_results')
    .select('question_id, is_correct')
    .eq('user_id', userId)
  if (e1) throw e1
  const rows = (results ?? []) as { question_id: string; is_correct: boolean }[]
  if (rows.length === 0) return []

  const qids = [...new Set(rows.map((r) => r.question_id))]
  const bankPairs: { question_id: string; subject_id: string }[] = []
  const chunk = 120
  for (let i = 0; i < qids.length; i += chunk) {
    const slice = qids.slice(i, i + chunk)
    const { data: bankRows, error: e2 } = await supabase
      .from('questions_bank')
      .select('question_id, subject_id')
      .in('question_id', slice)
    if (e2) throw e2
    bankPairs.push(...((bankRows ?? []) as { question_id: string; subject_id: string }[]))
  }

  const qToSubject = new Map(bankPairs.map((b) => [b.question_id, b.subject_id]))
  const agg = new Map<string, { correct: number; total: number }>()
  for (const r of rows) {
    const sid = qToSubject.get(r.question_id)
    if (!sid) continue
    const cur = agg.get(sid) ?? { correct: 0, total: 0 }
    cur.total += 1
    if (r.is_correct) cur.correct += 1
    agg.set(sid, cur)
  }

  return [...agg.entries()].map(([subjectId, v]) => ({
    subjectId,
    correct: v.correct,
    total: v.total,
  }))
}

/** public.questions_bank_results 집계(MCP: question_id FK → questions_bank, is_correct·answer_matches) */
export async function fetchQuestionsBankStatsForQuestion(
  questionId: string,
): Promise<{ correctCount: number; totalCount: number }> {
  const { count: totalCount, error: e1 } = await supabase
    .from('questions_bank_results')
    .select('*', { count: 'exact', head: true })
    .eq('question_id', questionId)
  if (e1) throw e1
  const { count: correctCount, error: e2 } = await supabase
    .from('questions_bank_results')
    .select('*', { count: 'exact', head: true })
    .eq('question_id', questionId)
    .eq('is_correct', true)
  if (e2) throw e2
  return {
    correctCount: correctCount ?? 0,
    totalCount: totalCount ?? 0,
  }
}

export async function insertQuestionsBankResult(args: {
  userId: string
  questionId: string
  userAnswer: string
  solveTimeSec: number | null
}): Promise<{ is_correct: boolean; answer_matches: boolean }> {
  const { data, error } = await supabase
    .from('questions_bank_results')
    .insert({
      user_id: args.userId,
      question_id: args.questionId,
      user_answer: args.userAnswer,
      solve_time: args.solveTimeSec,
    })
    .select('is_correct, answer_matches')
    .single()
  if (error) throw error
  return data as { is_correct: boolean; answer_matches: boolean }
}
