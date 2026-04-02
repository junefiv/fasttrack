import { supabase } from './supabase'
import type {
  BenchmarkLectureRow,
  BenchmarkMasteryRow,
  BenchmarkMockRow,
  BenchmarkOfficialRow,
  PassNavBundle,
  PassNavCategoryRemedy,
  PassNavDbAlertRow,
  PassNavTargetGoalRow,
  RecentAttemptRow,
  UniversityBenchmarkRow,
  UserLectureRow,
  UserMasteryRow,
  UserMockExamStatRow,
  UserOfficialExamStatRow,
} from '../types/passNav'
import { isSupabaseMissingRelationError } from './unknownError'
import { buildCategoryCompare, getWeakestCategoryForPrescription } from './passNavModel'
import {
  catalogCaptionWatchPath,
  catalogEbookPageWatchPath,
  fetchEbookPageNavContexts,
  fetchLectureCaptionNavContexts,
} from './fasttrackQueries'
import { questionsBankDrillPath } from './questionsBankNav'

function safeRows<T>(res: { data: unknown; error: unknown }, fallback: T[] = []): T[] {
  if (res.error) {
    if (isSupabaseMissingRelationError(res.error)) return fallback
    throw res.error
  }
  return (res.data ?? fallback) as T[]
}

/** 미해소 알림만, 최신순 (알림 센터) */
export async function fetchPassNavAlertsForUser(userId: string): Promise<PassNavDbAlertRow[]> {
  const res = await supabase
    .from('alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(1000)
  return safeRows<PassNavDbAlertRow>(res, [])
}

export function normalizeUniKey(u: string, d: string): string {
  const n = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${n(u)}|${n(d)}`
}

export function matchBenchmarkRow(
  primary: PassNavTargetGoalRow | null,
  benchmarks: UniversityBenchmarkRow[],
): UniversityBenchmarkRow | null {
  if (!primary) return null
  const key = normalizeUniKey(primary.university_name, primary.department_name)
  for (const b of benchmarks) {
    if (normalizeUniKey(b.university_name, b.department_name) === key) return b
  }
  return null
}

async function fetchRecentAttempts(userId: string): Promise<RecentAttemptRow[]> {
  const bankRes = await supabase
    .from('questions_bank_results')
    .select('is_correct, submitted_at, question_id, questions_bank(category_label, subject_id)')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(40)

  const bankRows = safeRows<{
    is_correct: boolean
    submitted_at: string
    question_id: string
    questions_bank: { category_label: string | null; subject_id: string } | null
  }>(bankRes, [])

  const catRes = await supabase
    .from('fasttrack_mock_exam_catalog_problem_exam_results')
    .select('is_correct, submitted_at, problem_id')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(40)

  const catRows = safeRows<{ is_correct: boolean; submitted_at: string; problem_id: string }>(catRes, [])

  const probIds = [...new Set(catRows.map((r) => r.problem_id))]
  let probMeta = new Map<
    string,
    { category_label: string | null; ebook_page_id: string | null; lecture_caption_id: string | null }
  >()
  if (probIds.length > 0) {
    const pr = await supabase
      .from('fasttrack_mock_exam_catalog_problems')
      .select('id, category_label, ebook_page_id, lecture_caption_id')
      .in('id', probIds)
    const plist = safeRows<{
      id: string
      category_label: string | null
      ebook_page_id: string | null
      lecture_caption_id: string | null
    }>(pr, [])
    probMeta = new Map(plist.map((p) => [p.id, p]))
  }

  const merged: RecentAttemptRow[] = [
    ...bankRows.map((r) => ({
      source: 'bank' as const,
      submitted_at: r.submitted_at,
      is_correct: r.is_correct,
      category_label: r.questions_bank?.category_label ?? null,
      subject_id: r.questions_bank?.subject_id ?? null,
      question_id: r.question_id,
      ebook_page_id: null as string | null,
      lecture_caption_id: null as string | null,
    })),
    ...catRows.map((r) => {
      const m = probMeta.get(r.problem_id)
      return {
        source: 'catalog' as const,
        submitted_at: r.submitted_at,
        is_correct: r.is_correct,
        category_label: m?.category_label ?? null,
        subject_id: null as string | null,
        question_id: r.problem_id,
        ebook_page_id: m?.ebook_page_id ?? null,
        lecture_caption_id: m?.lecture_caption_id ?? null,
      }
    }),
  ]
  merged.sort((a, b) => (a.submitted_at < b.submitted_at ? 1 : -1))
  return merged.slice(0, 12)
}

async function fetchBankPrescription(categoryLabel: string | null): Promise<
  { question_id: string; subject_id: string | null; category_label: string | null; tags: string[] | null }[]
> {
  if (!categoryLabel?.trim()) return []
  const q = await supabase
    .from('questions_bank')
    .select('question_id, subject_id, category_label, tags')
    .eq('category_label', categoryLabel)
    .limit(8)
  return safeRows(q, [])
}

function normUuidKey(s: string): string {
  return s.trim().toLowerCase()
}

function prescriptionRemedyFromQueue(
  q: { question_id: string; subject_id: string | null; category_label: string | null } | undefined,
): PassNavCategoryRemedy | null {
  if (!q?.subject_id?.trim() || !q.question_id?.trim()) return null
  const cat = q.category_label?.trim() ?? '처방 큐'
  const sid = q.subject_id.trim()
  const qid = q.question_id.trim()
  return {
    category_label: cat,
    videoHref: '/study/videos',
    ebookHref: '/study/videos',
    drillHref: `/study/mock-exam/questions-bank?subject=${encodeURIComponent(sid)}&question=${encodeURIComponent(qid)}`,
    videoHint: '강의에서 개념 복습',
    ebookHint: '교재에서 개념 복습',
    drillHint: '추천 처방 문항 풀기',
  }
}

async function buildRemedyFromRecentAttempt(row: RecentAttemptRow | undefined): Promise<PassNavCategoryRemedy | null> {
  if (!row) return null
  const label = row.category_label?.trim() ?? '최근 제출'
  const capId = row.lecture_caption_id?.trim()
  const ebId = row.ebook_page_id?.trim()

  const [capMap, ebookMap] = await Promise.all([
    capId ? fetchLectureCaptionNavContexts([capId]) : Promise.resolve(new Map()),
    ebId ? fetchEbookPageNavContexts([ebId]) : Promise.resolve(new Map()),
  ])

  let videoHref: string | null = null
  let videoHint: string | null = null
  if (capId) {
    const ctx = capMap.get(capId)
    if (ctx) {
      videoHref = catalogCaptionWatchPath(ctx)
      videoHint = `최근 풀이와 연결된 강의 구간 · ${ctx.start_sec}초부터`
    }
  }

  let ebookHref: string | null = null
  let ebookHint: string | null = null
  if (ebId) {
    const ctx = ebookMap.get(normUuidKey(ebId))
    if (ctx) {
      ebookHref = catalogEbookPageWatchPath(ctx)
      ebookHint = `최근 풀이와 연결된 교재 · ${ctx.page_number}페이지`
    }
  }

  let drillHref: string | null = null
  let drillHint: string | null = null
  if (row.source === 'bank') {
    drillHref = questionsBankDrillPath({
      subjectId: row.subject_id,
      questionId: row.question_id,
    })
    drillHint = drillHref ? '방금 풀었던 문항으로 이동' : null
  } else if (row.source === 'catalog') {
    drillHref = '/study/mock-exam'
    drillHint = '모의고사 풀기'
  }

  return {
    category_label: label,
    videoHref,
    ebookHref,
    drillHref,
    videoHint,
    ebookHint,
    drillHint,
  }
}

async function fetchGlobalLectureEbookSamples(): Promise<{
  videoHref: string | null
  videoHint: string | null
  ebookHref: string | null
  ebookHint: string | null
}> {
  const [{ data: capRow }, { data: ebRow }] = await Promise.all([
    supabase.from('lecture_captions').select('id').limit(1).maybeSingle(),
    supabase.from('ebook_pages').select('id').limit(1).maybeSingle(),
  ])
  let videoHref: string | null = null
  let videoHint: string | null = null
  let ebookHref: string | null = null
  let ebookHint: string | null = null
  if (capRow && typeof (capRow as { id?: string }).id === 'string') {
    const id = (capRow as { id: string }).id
    const m = await fetchLectureCaptionNavContexts([id])
    const ctx = m.get(id)
    if (ctx) {
      videoHref = catalogCaptionWatchPath(ctx)
      const mm = Math.floor(ctx.start_sec / 60)
      const ss = ctx.start_sec % 60
      videoHint = `참고용 강의 구간 · ${ctx.lecture_title || '강의'} ${mm}:${String(ss).padStart(2, '0')}`
    }
  }
  if (ebRow && typeof (ebRow as { id?: string }).id === 'string') {
    const id = (ebRow as { id: string }).id
    const m = await fetchEbookPageNavContexts([id])
    const ctx = m.get(normUuidKey(id))
    if (ctx) {
      ebookHref = catalogEbookPageWatchPath(ctx)
      ebookHint = `참고용 교재 · ${ctx.page_number}페이지`
    }
  }
  return { videoHref, videoHint, ebookHref, ebookHint }
}

async function fetchPassNavCategoryRemedies(labels: string[]): Promise<Record<string, PassNavCategoryRemedy>> {
  const uniq = [...new Set(labels.map((l) => l.trim()).filter(Boolean))].slice(0, 16)
  if (uniq.length === 0) return {}

  const bankPairs = await Promise.all(
    uniq.map(async (cat) => {
      const { data, error } = await supabase
        .from('questions_bank')
        .select('question_id, subject_id, instruction, content')
        .eq('category_label', cat)
        .limit(1)
        .maybeSingle()
      if (error || !data) return { cat, bank: null as { question_id: string; subject_id: string; preview: string } | null }
      const preview = (String(data.instruction ?? '').trim() || String(data.content ?? '').trim() || '').slice(0, 72)
      return {
        cat,
        bank: {
          question_id: data.question_id as string,
          subject_id: data.subject_id as string,
          preview,
        },
      }
    }),
  )

  const catalogPairs = await Promise.all(
    uniq.map(async (cat) => {
      const { data, error } = await supabase
        .from('fasttrack_mock_exam_catalog_problems')
        .select('ebook_page_id, lecture_caption_id')
        .eq('category_label', cat)
        .limit(30)
      let eb: string | null = null
      let cap: string | null = null
      if (!error && data) {
        for (const row of data as { ebook_page_id: string | null; lecture_caption_id: string | null }[]) {
          if (!eb && row.ebook_page_id?.trim()) eb = row.ebook_page_id.trim()
          if (!cap && row.lecture_caption_id?.trim()) cap = row.lecture_caption_id.trim()
          if (eb && cap) break
        }
      }
      return { cat, eb, cap }
    }),
  )

  const catToRefs = new Map(catalogPairs.map((x) => [x.cat, { eb: x.eb, cap: x.cap }]))
  const bankByCat = new Map(bankPairs.map((x) => [x.cat, x.bank]))

  const allEb = [...new Set(catalogPairs.map((x) => x.eb).filter(Boolean) as string[])]
  const allCap = [...new Set(catalogPairs.map((x) => x.cap).filter(Boolean) as string[])]

  const [ebookMap, capMap, globalFb] = await Promise.all([
    allEb.length ? fetchEbookPageNavContexts(allEb) : Promise.resolve(new Map()),
    allCap.length ? fetchLectureCaptionNavContexts(allCap) : Promise.resolve(new Map()),
    fetchGlobalLectureEbookSamples(),
  ])

  const out: Record<string, PassNavCategoryRemedy> = {}
  for (const cat of uniq) {
    const refs = catToRefs.get(cat) ?? { eb: null, cap: null }
    const bank = bankByCat.get(cat)

    let videoHref: string | null = null
    let videoHint: string | null = null
    if (refs.cap) {
      const ctx = capMap.get(refs.cap)
      if (ctx) {
        videoHref = catalogCaptionWatchPath(ctx)
        videoHint = `자막 · ${ctx.session_title || ctx.lecture_title || '강의'} (${ctx.start_sec}초~)`
      }
    }
    if (!videoHref && globalFb.videoHref) {
      videoHref = globalFb.videoHref
      videoHint = globalFb.videoHint
    }
    if (!videoHref) {
      videoHref = '/study/videos'
      videoHint = '강의 목록에서 회차 선택'
    }

    let ebookHref: string | null = null
    let ebookHint: string | null = null
    if (refs.eb) {
      const ctx = ebookMap.get(normUuidKey(refs.eb))
      if (ctx) {
        ebookHref = catalogEbookPageWatchPath(ctx)
        ebookHint = `교재 PDF p.${ctx.page_number}${ctx.resource_title ? ` · ${ctx.resource_title}` : ''}`
      }
    }
    if (!ebookHref && globalFb.ebookHref) {
      ebookHref = globalFb.ebookHref
      ebookHint = globalFb.ebookHint
    }
    if (!ebookHref) {
      ebookHref = '/study/videos'
      ebookHint = '강의 화면에서 교재 열기'
    }

    let drillHref: string | null = null
    let drillHint: string | null = null
    if (bank) {
      drillHref = questionsBankDrillPath({
        subjectId: bank.subject_id,
        questionId: bank.question_id,
      })
      drillHint = bank.preview
        ? `문제은행 · ${bank.preview}${bank.preview.length >= 72 ? '…' : ''}`
        : `문제은행 · 「${cat}」`
    }

    out[cat] = {
      category_label: cat,
      videoHref,
      ebookHref,
      drillHref,
      videoHint,
      ebookHint,
      drillHint,
    }
  }
  return out
}

export type FetchPassNavBundleOptions = {
  /** 비교·벤치마크 기준으로 쓸 지망(priority). 없으면 1지망 우선. */
  activePriority?: number
}

export async function fetchPassNavBundle(
  userId: string,
  options?: FetchPassNavBundleOptions,
): Promise<PassNavBundle> {
  const base: PassNavBundle = {
    goals: [],
    primaryGoal: null,
    benchmarkId: null,
    benchmarkRow: null,
    benchMastery: [],
    benchLecture: [],
    benchMock: [],
    benchOfficial: [],
    userMastery: [],
    userLecture: [],
    userMock: [],
    userOfficial: [],
    lectures: [],
    subjects: [],
    catalogs: [],
    recentAttempts: [],
    bankQuestionsForWeakTags: [],
    weakCategoryLabel: null,
    categoryRemedies: {},
    recentAttemptRemedy: null,
    prescriptionRemedy: null,
  }

  const goalsRes = await supabase
    .from('user_target_goals')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: true })

  const goals = [...safeRows<PassNavTargetGoalRow>(goalsRes, [])].sort((a, b) => a.priority - b.priority)
  const wantPriority = options?.activePriority ?? 1
  const primaryGoal =
    goals.find((g) => g.priority === wantPriority) ??
    goals.find((g) => g.priority === 1) ??
    goals[0] ??
    null

  const benchAllRes = await supabase.from('university_benchmarks').select('*')
  const benchmarks = safeRows<UniversityBenchmarkRow>(benchAllRes, [])
  const benchmarkRow = matchBenchmarkRow(primaryGoal, benchmarks)
  const benchmarkId = benchmarkRow?.id ?? null

  const [
    bmRes,
    blRes,
    bmockRes,
    boffRes,
    umRes,
    ulRes,
    umockRes,
    uoffRes,
    subRes,
    catRes,
    recent,
  ] = await Promise.all([
    benchmarkId
      ? supabase.from('benchmark_mastery_stats').select('*').eq('benchmark_id', benchmarkId)
      : Promise.resolve({ data: [], error: null }),
    benchmarkId
      ? supabase.from('benchmark_lecture_stats').select('*').eq('benchmark_id', benchmarkId)
      : Promise.resolve({ data: [], error: null }),
    benchmarkId
      ? supabase.from('benchmark_mock_exam_stats').select('*').eq('benchmark_id', benchmarkId)
      : Promise.resolve({ data: [], error: null }),
    benchmarkId
      ? supabase.from('benchmark_official_exam_stats').select('*').eq('benchmark_id', benchmarkId)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('user_mastery_stats').select('*').eq('user_id', userId),
    supabase.from('user_lecture_stats').select('*').eq('user_id', userId),
    supabase.from('user_mock_exam_stats').select('*').eq('user_id', userId),
    supabase.from('user_official_exam_stats').select('*').eq('user_id', userId),
    supabase.from('subjects').select('id,name,category'),
    supabase.from('fasttrack_mock_exam_catalog').select('id,title,subject_id'),
    fetchRecentAttempts(userId),
  ])

  const userLecture = safeRows<UserLectureRow>(ulRes, [])
  const benchLectureList = safeRows<BenchmarkLectureRow>(blRes, [])
  const lectureIdSet = new Set<string>()
  for (const u of userLecture) lectureIdSet.add(u.lecture_id)
  for (const b of benchLectureList) lectureIdSet.add(b.lecture_id)

  let lectures: { id: string; title: string; subject_id: string }[] = []
  if (lectureIdSet.size > 0) {
    const lr = await supabase
      .from('lectures')
      .select('id,title,subject_id')
      .in('id', [...lectureIdSet])
    lectures = safeRows(lr, [])
  }

  const userMastery = safeRows<UserMasteryRow>(umRes, [])
  const benchMasteryList = safeRows<BenchmarkMasteryRow>(bmRes, [])
  const benchMockList = safeRows<BenchmarkMockRow>(bmockRes, [])
  const userMockList = safeRows<UserMockExamStatRow>(umockRes, [])
  const subjectsList = safeRows<{ id: string; name: string; category: string | null }>(subRes, [])
  const catalogsList = safeRows<{ id: string; title: string; subject_id: string }>(catRes, [])

  const bundleForPrescription: PassNavBundle = {
    ...base,
    goals,
    primaryGoal,
    benchmarkId,
    benchmarkRow,
    benchMastery: benchMasteryList,
    benchLecture: benchLectureList,
    benchMock: benchMockList,
    benchOfficial: safeRows<BenchmarkOfficialRow>(boffRes, []),
    userMastery,
    userLecture,
    userMock: userMockList,
    userOfficial: safeRows<UserOfficialExamStatRow>(uoffRes, []),
    lectures,
    subjects: subjectsList,
    catalogs: catalogsList,
    recentAttempts: recent,
    bankQuestionsForWeakTags: [],
    weakCategoryLabel: null,
    categoryRemedies: {},
    recentAttemptRemedy: null,
    prescriptionRemedy: null,
  }
  const weakCat = getWeakestCategoryForPrescription(bundleForPrescription)
  const compares = buildCategoryCompare(bundleForPrescription)
  const remedyLabels = new Set<string>()
  if (weakCat) remedyLabels.add(weakCat)
  for (const c of compares.slice(0, 12)) remedyLabels.add(c.category_label)
  if (recent[0]?.category_label) remedyLabels.add(recent[0].category_label)
  for (const c of compares.filter((x) => x.traffic === 'red').slice(0, 6)) remedyLabels.add(c.category_label)

  const [bankQuestionsForWeakTags, recentAttemptRemedy, categoryRemedies] = await Promise.all([
    fetchBankPrescription(weakCat),
    buildRemedyFromRecentAttempt(recent[0]),
    fetchPassNavCategoryRemedies([...remedyLabels]),
  ])

  const prescriptionRemedy = prescriptionRemedyFromQueue(bankQuestionsForWeakTags[0])

  return {
    ...bundleForPrescription,
    bankQuestionsForWeakTags,
    weakCategoryLabel: weakCat,
    categoryRemedies,
    recentAttemptRemedy,
    prescriptionRemedy,
  }

}
