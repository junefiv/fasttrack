import { getDDay, passNavSubjectBarOverallPct } from './passNavModel'
import type { PassNavBundle, PassNavSubjectMetricRow } from '../types/passNav'

export type PassNavStudyTrendMetricKey = 'study' | 'problems' | 'avgSec'
export type PassNavStudyTrendPeriodKey = 'daily' | 'monthly'

/** 차트 범례와 동일 */
export const BENCHMARK_SERIES_NAME = '벤치마크 평균'

export const PASS_NAV_STUDY_TREND_SUBJECTS = [
  { key: '수학', color: 'teal.6' },
  { key: '역사', color: 'violet.6' },
  { key: '국어', color: 'blue.6' },
  { key: '영어', color: 'orange.6' },
] as const

export const PASS_NAV_STUDY_TREND_SUBJECT_KEYS = ['수학', '역사', '국어', '영어'] as const

/** 1~3월 일수 (비윤년 기준: 1월 31, 2월 28, 3월 31) */
export const PASS_NAV_STUDY_TREND_Q1_MONTH_LENGTHS = [31, 28, 31] as const

export type PassNavStudyTrendMockBlock = {
  labels: string[]
  /** 과목·지표별 벤치마크(선배 평균) — 과목을 바꾸면 이 선도 달라짐 */
  benchmarkBySubject: Record<PassNavStudyTrendMetricKey, Record<string, number[]>>
  /** 과목·지표별 현재 유저 */
  series: Record<PassNavStudyTrendMetricKey, Record<string, number[]>>
}

export type PassNavStudyTrendMockBundle = Record<PassNavStudyTrendPeriodKey, PassNavStudyTrendMockBlock>

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** `1/1` … `3/31` (90일) */
function buildQ1DailyLabels(): string[] {
  const labels: string[] = []
  for (let m = 1; m <= 3; m++) {
    const dim = PASS_NAV_STUDY_TREND_Q1_MONTH_LENGTHS[m - 1]
    for (let d = 1; d <= dim; d++) {
      labels.push(`${m}/${d}`)
    }
  }
  return labels
}

/** 일자별 배열을 월별 평균(1·2·3월)으로 집계 */
export function aggregatePassNavStudyTrendMonthlyFromDaily(daily: number[]): number[] {
  let start = 0
  return PASS_NAV_STUDY_TREND_Q1_MONTH_LENGTHS.map((len) => {
    const slice = daily.slice(start, start + len)
    start += len
    if (slice.length === 0) return 0
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length
    return round1(avg)
  })
}

/**
 * 1월 1일 ~ 3월 31일 일자별 목업 + 벤치마크 평균선 + 과목별(접속 유저) 시리즈.
 * 월별은 일자별을 월 단위로 평균한 값만 사용(별도 목업 없음).
 */
/** 과목·지표마다 다른 위상·스케일로 벤치마크 일별 곡선 생성 */
function generateBenchmarkSeriesForSubject(
  sub: string,
  metric: PassNavStudyTrendMetricKey,
  n: number,
): number[] {
  const seed = 0x5e47 + sub.charCodeAt(0) * 173 + sub.charCodeAt(1) * 37 + (metric === 'study' ? 11 : metric === 'problems' ? 23 : 41)
  const rng = mulberry32(seed)
  const phase = sub.charCodeAt(0) * 0.11 + (metric === 'avgSec' ? 1.7 : metric === 'problems' ? 0.9 : 0)
  const amp =
    metric === 'study' ? 11 : metric === 'problems' ? 5 : 9
  const base =
    metric === 'study' ? 38 : metric === 'problems' ? 16 : 88
  const out: number[] = []
  for (let d = 0; d < n; d++) {
    const t = d / Math.max(1, n - 1)
    const w = rng() * 6 - 3
    if (metric === 'study') {
      out.push(round1(base + amp * Math.sin(t * Math.PI * 2 + phase) + 5 * Math.sin(t * Math.PI * 5 + phase * 0.5) + w))
    } else if (metric === 'problems') {
      out.push(
        round1(
          base + amp * Math.sin(t * Math.PI * 2.5 + phase) + 3 * Math.sin(t * Math.PI * 4 + phase) + w * 0.55,
        ),
      )
    } else {
      out.push(round1(base + amp * Math.sin(t * Math.PI * 2 + phase * 1.1) + 4 * Math.sin(t * Math.PI * 3 + phase) + w))
    }
  }
  return out
}

/** 동일 과목 벤치 대비 유저 선(과목·지표별로 다른 간격) */
function userFromBench(bench: number[], sub: string, metric: PassNavStudyTrendMetricKey): number[] {
  const rng = mulberry32(0x91c0 + sub.charCodeAt(0) * 131 + sub.charCodeAt(1) * 17 + (metric === 'study' ? 3 : metric === 'problems' ? 7 : 13))
  const shift =
    metric === 'study'
      ? sub === '수학'
        ? 5
        : sub === '역사'
          ? -6
          : sub === '국어'
            ? -2
            : 6
      : metric === 'problems'
        ? sub === '수학'
          ? 3
          : sub === '역사'
            ? -2
            : sub === '국어'
              ? 1
              : 4
        : sub === '수학'
          ? -5
          : sub === '역사'
            ? 9
            : sub === '국어'
              ? 12
              : -7

  return bench.map((b, i) => {
    const jitter = 0.9 + rng() * 0.18
    const wave = 1 + 0.045 * Math.sin((i / 17) * Math.PI * 2 + sub.length * 0.2)
    return round1((b + shift) * jitter * wave)
  })
}

export function buildPassNavStudyTrendMockBundle(): PassNavStudyTrendMockBundle {
  const labels = buildQ1DailyLabels()
  const n = labels.length

  const benchmarkBySubject: Record<PassNavStudyTrendMetricKey, Record<string, number[]>> = {
    study: {},
    problems: {},
    avgSec: {},
  }
  const series: Record<PassNavStudyTrendMetricKey, Record<string, number[]>> = {
    study: {},
    problems: {},
    avgSec: {},
  }

  for (const sub of PASS_NAV_STUDY_TREND_SUBJECT_KEYS) {
    const bStudy = generateBenchmarkSeriesForSubject(sub, 'study', n)
    const bProb = generateBenchmarkSeriesForSubject(sub, 'problems', n)
    const bSec = generateBenchmarkSeriesForSubject(sub, 'avgSec', n)
    benchmarkBySubject.study[sub] = bStudy
    benchmarkBySubject.problems[sub] = bProb
    benchmarkBySubject.avgSec[sub] = bSec
    series.study[sub] = userFromBench(bStudy, sub, 'study')
    series.problems[sub] = userFromBench(bProb, sub, 'problems')
    series.avgSec[sub] = userFromBench(bSec, sub, 'avgSec')
  }

  const daily: PassNavStudyTrendMockBlock = {
    labels,
    benchmarkBySubject,
    series,
  }

  const monthly: PassNavStudyTrendMockBlock = {
    labels: ['1월', '2월', '3월'],
    benchmarkBySubject: {
      study: Object.fromEntries(
        PASS_NAV_STUDY_TREND_SUBJECT_KEYS.map((k) => [
          k,
          aggregatePassNavStudyTrendMonthlyFromDaily(benchmarkBySubject.study[k]),
        ]),
      ),
      problems: Object.fromEntries(
        PASS_NAV_STUDY_TREND_SUBJECT_KEYS.map((k) => [
          k,
          aggregatePassNavStudyTrendMonthlyFromDaily(benchmarkBySubject.problems[k]),
        ]),
      ),
      avgSec: Object.fromEntries(
        PASS_NAV_STUDY_TREND_SUBJECT_KEYS.map((k) => [
          k,
          aggregatePassNavStudyTrendMonthlyFromDaily(benchmarkBySubject.avgSec[k]),
        ]),
      ),
    },
    series: {
      study: Object.fromEntries(
        PASS_NAV_STUDY_TREND_SUBJECT_KEYS.map((k) => [k, aggregatePassNavStudyTrendMonthlyFromDaily(series.study[k])]),
      ),
      problems: Object.fromEntries(
        PASS_NAV_STUDY_TREND_SUBJECT_KEYS.map((k) => [
          k,
          aggregatePassNavStudyTrendMonthlyFromDaily(series.problems[k]),
        ]),
      ),
      avgSec: Object.fromEntries(
        PASS_NAV_STUDY_TREND_SUBJECT_KEYS.map((k) => [k, aggregatePassNavStudyTrendMonthlyFromDaily(series.avgSec[k])]),
      ),
    },
  }

  return { daily, monthly }
}

/** UI·리포트 공통 목업 (일자별 생성 후 월별은 일 평균으로만 산출) */
export const PASS_NAV_STUDY_TREND_HARDCODED: PassNavStudyTrendMockBundle = buildPassNavStudyTrendMockBundle()

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function flatFill(value: number | null, len: number): (number | null)[] {
  if (value == null || Number.isNaN(value)) return Array(len).fill(null)
  const v = Math.round(value * 10) / 10
  return Array(len).fill(v)
}

function meanAtIndex(lines: (number | null)[][], i: number): number | null {
  const xs = lines.map((line) => line[i]).filter((v): v is number => v != null && !Number.isNaN(v))
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function mergeLineWithDemo(real: (number | null)[], demo: number[]): number[] {
  return real.map((v, i) => (v != null && !Number.isNaN(v) ? v : demo[i] ?? 0))
}

function sumUserWatchMinutes(bundle: PassNavBundle, subjectId: string): number | null {
  const lectureToSubject = new Map(bundle.lectures.map((l) => [l.id, l.subject_id]))
  let sec = 0
  let any = false
  for (const u of bundle.userLecture) {
    if (lectureToSubject.get(u.lecture_id) !== subjectId) continue
    const t = num(u.total_watch_time_sec)
    if (t != null) {
      sec += t
      any = true
    }
  }
  if (!any) return null
  return sec / 60
}

function sumBenchWatchMinutes(bundle: PassNavBundle, subjectId: string): number | null {
  const lectureToSubject = new Map(bundle.lectures.map((l) => [l.id, l.subject_id]))
  let sec = 0
  let any = false
  for (const u of bundle.benchLecture) {
    if (lectureToSubject.get(u.lecture_id) !== subjectId) continue
    const t = num(u.total_watch_time_sec)
    if (t != null) {
      sec += t
      any = true
    }
  }
  if (!any) return null
  return sec / 60
}

function catalogToSubjectMap(bundle: PassNavBundle): Map<string, string> {
  return new Map(bundle.catalogs.map((c) => [c.id, c.subject_id]))
}

/** 마스터리·모의고사 행 수 기반 추정 문항 활동량(일·월 평균용 스칼라) */
function problemVolumeUser(bundle: PassNavBundle, subjectId: string): number | null {
  const m = bundle.userMastery.filter((u) => u.subject_id === subjectId).length
  const catMap = catalogToSubjectMap(bundle)
  const mock = bundle.userMock.filter((u) => catMap.get(u.catalog_id) === subjectId).length
  const total = m * 2 + mock * 3
  if (m === 0 && mock === 0) return null
  return Math.max(0, total)
}

function problemVolumeBench(bundle: PassNavBundle, subjectId: string): number | null {
  const m = bundle.benchMastery.filter((u) => u.subject_id === subjectId).length
  const catMap = catalogToSubjectMap(bundle)
  const mock = bundle.benchMock.filter((u) => catMap.get(u.catalog_id) === subjectId).length
  const total = m * 2 + mock * 3
  if (m === 0 && mock === 0) return null
  return Math.max(0, total)
}

export function findPassNavMetricRowForTrendKey(
  rows: PassNavSubjectMetricRow[],
  key: string,
): PassNavSubjectMetricRow | undefined {
  return rows.find((r) => r.subjectName === key) ?? rows.find((r) => r.subjectName.includes(key))
}

export type PassNavStudyTrendMetricBlock = {
  study: (number | null)[]
  problems: (number | null)[]
  avgSec: (number | null)[]
}

export type PassNavStudyTrendReportPayload = {
  chartSubjects: readonly string[]
  metricLabels: Record<string, string>
  fromBundle: {
    labels: { daily: string[]; monthly: string[] }
    benchmarkAvg: {
      daily: Record<PassNavStudyTrendMetricKey, number[]>
      monthly: Record<PassNavStudyTrendMetricKey, number[]>
    }
    userBySubject: Record<
      string,
      { subjectId: string | null; daily: PassNavStudyTrendMetricBlock; monthly: PassNavStudyTrendMetricBlock }
    >
    benchBySubject: Record<
      string,
      { subjectId: string | null; daily: PassNavStudyTrendMetricBlock; monthly: PassNavStudyTrendMetricBlock }
    >
  }
  chartDemoUi: PassNavStudyTrendMockBundle
  notes: string[]
}

function buildBlock(
  period: PassNavStudyTrendPeriodKey,
  uW: number | null,
  bW: number | null,
  uP: number | null,
  bP: number | null,
  uSec: number | null,
  bSec: number | null,
): { user: PassNavStudyTrendMetricBlock; bench: PassNavStudyTrendMetricBlock } {
  const demo = PASS_NAV_STUDY_TREND_HARDCODED[period]
  const n = demo.labels.length
  const div = n
  const uStudy = uW != null ? uW / div : null
  const bStudy = bW != null ? bW / div : null
  const uProb = uP != null ? uP / div : null
  const bProb = bP != null ? bP / div : null
  return {
    user: {
      study: flatFill(uStudy, n),
      problems: flatFill(uProb, n),
      avgSec: flatFill(uSec, n),
    },
    bench: {
      study: flatFill(bStudy, n),
      problems: flatFill(bProb, n),
      avgSec: flatFill(bSec, n),
    },
  }
}

function cohortBenchmarkLine(
  perSubjectBench: PassNavStudyTrendMetricBlock[],
  metric: PassNavStudyTrendMetricKey,
  len: number,
  demo: number[],
): number[] {
  const lines = perSubjectBench.map((b) => b[metric])
  const real: (number | null)[] = []
  for (let i = 0; i < len; i++) {
    real.push(meanAtIndex(lines, i))
  }
  return mergeLineWithDemo(real, demo)
}

/** 목업에서 과목별 벤치를 일평균한 코호트 기준선(리포트 폴백용) */
function demoCohortBenchmarkFromMock(
  demo: PassNavStudyTrendMockBlock,
  metric: PassNavStudyTrendMetricKey,
  len: number,
): number[] {
  return Array.from({ length: len }, (_, i) => {
    const xs = PASS_NAV_STUDY_TREND_SUBJECT_KEYS.map((k) => demo.benchmarkBySubject[metric][k][i]).filter((x) =>
      Number.isFinite(x),
    )
    if (xs.length === 0) return 0
    return round1(xs.reduce((a, b) => a + b, 0) / xs.length)
  })
}

/**
 * 네비게이터 리포트(Gemini)용: 차트와 동일한 지표·구간·과목 축 + 실제 번들 기반 시계열 + 차트 데모 참조.
 */
export function buildPassNavStudyTrendForReport(
  bundle: PassNavBundle,
  subjectMetricRows: PassNavSubjectMetricRow[],
): PassNavStudyTrendReportPayload {
  const dailyDemo = PASS_NAV_STUDY_TREND_HARDCODED.daily
  const monthlyDemo = PASS_NAV_STUDY_TREND_HARDCODED.monthly
  const dLen = dailyDemo.labels.length
  const mLen = monthlyDemo.labels.length

  const userBySubject: PassNavStudyTrendReportPayload['fromBundle']['userBySubject'] = {}
  const benchBySubject: PassNavStudyTrendReportPayload['fromBundle']['benchBySubject'] = {}

  const benchBlocksDaily: PassNavStudyTrendMetricBlock[] = []
  const benchBlocksMonthly: PassNavStudyTrendMetricBlock[] = []

  for (const key of PASS_NAV_STUDY_TREND_SUBJECT_KEYS) {
    const row = findPassNavMetricRowForTrendKey(subjectMetricRows, key)
    const sid = row?.subjectId ?? null
    const uW = sid ? sumUserWatchMinutes(bundle, sid) : null
    const bW = sid ? sumBenchWatchMinutes(bundle, sid) : null
    const uP = sid ? problemVolumeUser(bundle, sid) : null
    const bP = sid ? problemVolumeBench(bundle, sid) : null
    const uSec = row?.userSec ?? null
    const bSec = row?.benchSec ?? null

    const daily = buildBlock('daily', uW, bW, uP, bP, uSec, bSec)
    const monthly = buildBlock('monthly', uW, bW, uP, bP, uSec, bSec)
    userBySubject[key] = { subjectId: sid, daily: daily.user, monthly: monthly.user }
    benchBySubject[key] = { subjectId: sid, daily: daily.bench, monthly: monthly.bench }
    benchBlocksDaily.push(daily.bench)
    benchBlocksMonthly.push(monthly.bench)
  }

  const benchmarkAvgDaily: Record<PassNavStudyTrendMetricKey, number[]> = {
    study: cohortBenchmarkLine(
      benchBlocksDaily,
      'study',
      dLen,
      demoCohortBenchmarkFromMock(dailyDemo, 'study', dLen),
    ),
    problems: cohortBenchmarkLine(
      benchBlocksDaily,
      'problems',
      dLen,
      demoCohortBenchmarkFromMock(dailyDemo, 'problems', dLen),
    ),
    avgSec: cohortBenchmarkLine(
      benchBlocksDaily,
      'avgSec',
      dLen,
      demoCohortBenchmarkFromMock(dailyDemo, 'avgSec', dLen),
    ),
  }
  const benchmarkAvgMonthly: Record<PassNavStudyTrendMetricKey, number[]> = {
    study: cohortBenchmarkLine(
      benchBlocksMonthly,
      'study',
      mLen,
      demoCohortBenchmarkFromMock(monthlyDemo, 'study', mLen),
    ),
    problems: cohortBenchmarkLine(
      benchBlocksMonthly,
      'problems',
      mLen,
      demoCohortBenchmarkFromMock(monthlyDemo, 'problems', mLen),
    ),
    avgSec: cohortBenchmarkLine(
      benchBlocksMonthly,
      'avgSec',
      mLen,
      demoCohortBenchmarkFromMock(monthlyDemo, 'avgSec', mLen),
    ),
  }

  return {
    chartSubjects: [...PASS_NAV_STUDY_TREND_SUBJECT_KEYS],
    metricLabels: {
      study: '수강시간(분/구간) — 강의 total_watch_time 합을 구간 수로 나눈 값',
      problems: '문제 활동량(추정/구간) — 과목별 마스터리·모의 행 수 가중 합을 구간 수로 나눈 값',
      avgSec: '평균 풀이시간(초) — Pass-Nav 과목 지표와 동일 출처(마스터리·모의 평균)',
    },
    fromBundle: {
      labels: {
        daily: dailyDemo.labels,
        monthly: monthlyDemo.labels,
      },
      benchmarkAvg: {
        daily: benchmarkAvgDaily,
        monthly: benchmarkAvgMonthly,
      },
      userBySubject,
      benchBySubject,
    },
    chartDemoUi: PASS_NAV_STUDY_TREND_HARDCODED,
    notes: [
      'fromBundle: 현재 로그인 사용자·벤치마크 번들 기준. 시계열은 일·월별 원시 일자 데이터가 없어 구간 평균을 동일 값으로 펼친 형태임.',
      'chartDemoUi: 화면 「과목별 추이」 목업(1/1~3/31 일자별, 월별은 일자 평균)과 동일.',
      '벤치마크 미연결·과목 미매칭 시 cohort 평균은 chartDemoUi의 과목별 벤치를 일평균한 값으로 보완됨.',
    ],
  }
}

/**
 * 처방 큐(Gemini): 목표·D-Day·종합% + `buildPassNavStudyTrendTextBody` (차트와 동일 출처).
 * `alertBodiesCorpus` 와 교차해 종합 진단·처방에 쓴다.
 */
export function buildPassNavPrescriptionLearningContext(
  bundle: PassNavBundle,
  subjectMetricRows: PassNavSubjectMetricRow[],
): string {
  const dDay = getDDay()
  const overallPct = passNavSubjectBarOverallPct(subjectMetricRows)
  const g = bundle.primaryGoal
  const goalLine = g ? `${g.university_name} ${g.department_name}` : '목표 미설정'
  const meta = [
    '【목표·스냅샷】',
    `지망: ${goalLine}`,
    `D-Day: ${dDay}`,
    `종합 진척도(바): ${overallPct.toFixed(0)}%`,
    `벤치마크 연결: ${bundle.benchmarkId ? '예' : '아니오'}`,
    '',
  ].join('\n')
  return `${meta}${buildPassNavStudyTrendTextBody(bundle, subjectMetricRows)}`
}

/** 텍스트 리포트 섹션용 요약 */
export function buildPassNavStudyTrendTextBody(
  bundle: PassNavBundle,
  subjectMetricRows: PassNavSubjectMetricRow[],
): string {
  const trend = buildPassNavStudyTrendForReport(bundle, subjectMetricRows)
  const lines: string[] = [
    '【과목별 추이 축】 수강시간·문제 활동량(추정)·평균 풀이시간 / 일자별·월별 라벨은 차트와 동일.',
    `벤치마크 연결: ${bundle.benchmarkId ? '예' : '아니오'}`,
    '',
  ]
  for (const key of PASS_NAV_STUDY_TREND_SUBJECT_KEYS) {
    const u = trend.fromBundle.userBySubject[key]
    const row = findPassNavMetricRowForTrendKey(subjectMetricRows, key)
    const sid = u?.subjectId
    const study0 = u?.daily.study[0]
    const prob0 = u?.daily.problems[0]
    const sec0 = u?.daily.avgSec[0]
    lines.push(
      `${key}: subjectId=${sid ?? '—'} · 일구간 평균 추정 — 수강 ${study0 != null ? `${study0}분` : '—'}, 문제활동 ${prob0 != null ? `${prob0}` : '—'}, 평균풀이 ${sec0 != null ? `${sec0}초` : '—'} (과목행 매칭: ${row ? '됨' : '없음'})`,
    )
  }
  lines.push('')
  lines.push(
    '벤치 코호트 월 평균(수강·분): ' +
      trend.fromBundle.benchmarkAvg.monthly.study.map((x) => x.toFixed(1)).join(', ') +
      ' (1~3월)',
  )
  return lines.join('\n')
}

