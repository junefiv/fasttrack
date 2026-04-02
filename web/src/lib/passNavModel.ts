import type {
  PassNavBundle,
  BenchmarkMasteryRow,
  CategoryMasteryCompare,
  PassNavSubjectMetricRow,
  PassNavTraffic,
  UserMasteryRow,
} from '../types/passNav'
import {
  ACCURACY_ALERT_GAP_PP,
  DEVIATION_MAX_STREAK,
  SOLVE_TIME_SLOW_RATIO,
  STAGNATION_SLOW_RATIO,
  TRAFFIC_GREEN_ACCURACY_DELTA,
  TRAFFIC_RED_ACCURACY_DELTA,
  TRAFFIC_YELLOW_ACCURACY_BAND,
} from './passNavThresholds'
import type { FocusSnapshot } from './passNavFocusStorage'

/** 알림·집계 UI: subjects.category가 있으면 그것을 과목 표기로 쓰고, 없으면 name */
export function passNavSubjectDisplayLabel(bundle: PassNavBundle, subjectId: string): string {
  const s = bundle.subjects.find((x) => x.id === subjectId)
  if (!s) return `과목 (${subjectId.slice(0, 8)}…)`
  const c = (s.category ?? '').trim()
  return c || s.name
}

export function getNextExamDate(now = new Date()): Date {
  const y = now.getFullYear()
  let exam = new Date(y, 10, 12)
  if (now.getTime() > exam.getTime()) exam = new Date(y + 1, 10, 12)
  return exam
}

export function getDDay(now = new Date()): number {
  const exam = getNextExamDate(now)
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const b = new Date(exam.getFullYear(), exam.getMonth(), exam.getDate()).getTime()
  return Math.round((b - a) / 86400000)
}

function num(v: unknown): number | null {
  if (v == null || Number.isNaN(Number(v))) return null
  return Number(v)
}

function combineAvg(a: number | null, b: number | null): number | null {
  const parts = [a, b].filter((x): x is number => x != null)
  if (parts.length === 0) return null
  return parts.reduce((x, y) => x + y, 0) / parts.length
}

/** 모의고사 JSON: 키 = category_label, 값 = { accuracy, avg_solve_time } */
export type MockCategoryMetrics = { accuracy: number | null; avg_solve_time: number | null }

export function parseMockCategoryDetailRecord(
  raw: Record<string, unknown> | null | undefined,
): Map<string, MockCategoryMetrics> {
  const out = new Map<string, MockCategoryMetrics>()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [label, v] of Object.entries(raw)) {
    const key = label.trim()
    if (!key) continue
    if (v == null || typeof v !== 'object' || Array.isArray(v)) continue
    const o = v as Record<string, unknown>
    const accuracy = num(o.accuracy)
    const avg_solve_time = num(o.avg_solve_time)
    if (accuracy == null && avg_solve_time == null) continue
    out.set(key, { accuracy, avg_solve_time })
  }
  return out
}

function trafficForPair(
  userAcc: number | null,
  userTime: number | null,
  benchAcc: number | null,
  benchTime: number | null,
): PassNavTraffic {
  if (benchAcc == null || userAcc == null) return 'yellow'
  const accDelta = userAcc - benchAcc
  const gapAcc = benchAcc - userAcc
  const gapTimeOk = benchTime != null && userTime != null && benchTime > 0
  const timeRed = gapTimeOk && userTime > benchTime * SOLVE_TIME_SLOW_RATIO
  const timeYellow = gapTimeOk && userTime > benchTime * 1.05
  if (accDelta >= TRAFFIC_GREEN_ACCURACY_DELTA && !timeRed) return 'green'
  if (gapAcc >= 10 || (gapTimeOk && userTime - benchTime > benchTime * 0.2)) return 'red'
  if (accDelta <= TRAFFIC_RED_ACCURACY_DELTA) return 'red'
  if (Math.abs(accDelta) <= TRAFFIC_YELLOW_ACCURACY_BAND || timeYellow || timeRed) return 'yellow'
  if (accDelta < 0) return 'yellow'
  return 'green'
}

/** 과목(또는 전체 AVG) 단위로 mastery 벤치·유저를 category_label 기준으로 합친 행 */
export type PassNavCategoryDetailRow = {
  subjectId: string
  subjectName: string
  category_label: string
  userSolveTime: number | null
  benchSolveTime: number | null
  userAccuracy: number | null
  benchAccuracy: number | null
}

function mergeMasteryCategory(
  map: Map<string, PassNavCategoryDetailRow>,
  subjectId: string,
  categoryLabel: string,
  subjectName: string,
  patch: Partial<Pick<PassNavCategoryDetailRow, 'userSolveTime' | 'benchSolveTime' | 'userAccuracy' | 'benchAccuracy'>>,
) {
  const k = `${subjectId}\0${categoryLabel}`
  const cur =
    map.get(k) ??
    ({
      subjectId,
      subjectName,
      category_label: categoryLabel,
      userSolveTime: null,
      benchSolveTime: null,
      userAccuracy: null,
      benchAccuracy: null,
    } satisfies PassNavCategoryDetailRow)
  const next: PassNavCategoryDetailRow = {
    ...cur,
    subjectName: subjectName || cur.subjectName,
  }
  if (patch.userSolveTime !== undefined) {
    next.userSolveTime = combineAvg(cur.userSolveTime, patch.userSolveTime)
  }
  if (patch.benchSolveTime !== undefined) {
    next.benchSolveTime = combineAvg(cur.benchSolveTime, patch.benchSolveTime)
  }
  if (patch.userAccuracy !== undefined) {
    next.userAccuracy = combineAvg(cur.userAccuracy, patch.userAccuracy)
  }
  if (patch.benchAccuracy !== undefined) {
    next.benchAccuracy = combineAvg(cur.benchAccuracy, patch.benchAccuracy)
  }
  map.set(k, next)
}

/** `subjectScope === '__avg'`이면 모든 과목(정렬 시 과목명 우선). */
export function buildPassNavCategoryDetailRows(
  bundle: PassNavBundle,
  subjectScope: '__avg' | string,
): PassNavCategoryDetailRow[] {
  const map = new Map<string, PassNavCategoryDetailRow>()

  const takeUser = (u: UserMasteryRow) => {
    if (subjectScope !== '__avg' && u.subject_id !== subjectScope) return
    mergeMasteryCategory(map, u.subject_id, u.category_label, passNavSubjectDisplayLabel(bundle, u.subject_id), {
      userSolveTime: num(u.avg_solve_time),
      userAccuracy: num(u.avg_accuracy),
    })
  }
  const takeBench = (b: BenchmarkMasteryRow) => {
    if (subjectScope !== '__avg' && b.subject_id !== subjectScope) return
    mergeMasteryCategory(map, b.subject_id, b.category_label, passNavSubjectDisplayLabel(bundle, b.subject_id), {
      benchSolveTime: num(b.target_solve_time),
      benchAccuracy: num(b.target_accuracy),
    })
  }

  for (const u of bundle.userMastery) takeUser(u)
  for (const b of bundle.benchMastery) takeBench(b)

  const catalogToSubject = new Map(bundle.catalogs.map((c) => [c.id, c.subject_id]))
  const benchMockByCatalog = new Map(bundle.benchMock.map((m) => [m.catalog_id, m]))
  const userCatalogIds = new Set(bundle.userMock.map((u) => u.catalog_id))

  const mergeMockCatalogRow = (catalogId: string) => {
    const sid = catalogToSubject.get(catalogId)
    if (!sid) return
    if (subjectScope !== '__avg' && sid !== subjectScope) return
    const subjName = passNavSubjectDisplayLabel(bundle, sid)
    const um = bundle.userMock.find((u) => u.catalog_id === catalogId)
    const bm = benchMockByCatalog.get(catalogId)
    const uMap = parseMockCategoryDetailRecord(um?.category_detail_stats ?? null)
    const bMap = parseMockCategoryDetailRecord(bm?.category_detail_benchmarks ?? null)
    const labels = new Set<string>([...uMap.keys(), ...bMap.keys()])
    for (const label of labels) {
      const uM = uMap.get(label)
      const bM = bMap.get(label)
      const patch: Partial<
        Pick<PassNavCategoryDetailRow, 'userSolveTime' | 'benchSolveTime' | 'userAccuracy' | 'benchAccuracy'>
      > = {}
      if (uM) {
        if (uM.avg_solve_time != null) patch.userSolveTime = uM.avg_solve_time
        if (uM.accuracy != null) patch.userAccuracy = uM.accuracy
      }
      if (bM) {
        if (bM.avg_solve_time != null) patch.benchSolveTime = bM.avg_solve_time
        if (bM.accuracy != null) patch.benchAccuracy = bM.accuracy
      }
      if (Object.keys(patch).length > 0) mergeMasteryCategory(map, sid, label, subjName, patch)
    }
  }

  for (const um of bundle.userMock) mergeMockCatalogRow(um.catalog_id)

  for (const bm of bundle.benchMock) {
    if (userCatalogIds.has(bm.catalog_id)) continue
    mergeMockCatalogRow(bm.catalog_id)
  }

  return [...map.values()].sort((a, b) => {
    if (subjectScope === '__avg') {
      const s = a.subjectName.localeCompare(b.subjectName, 'ko')
      if (s !== 0) return s
    }
    return a.category_label.localeCompare(b.category_label, 'ko')
  })
}

export type PassNavLectureDetailRow = {
  lectureId: string
  subjectId: string
  subjectName: string
  lectureTitle: string
  userCompletion: number | null
  benchCompletion: number | null
  userConsecutive: number | null
  benchConsecutive: number | null
}

export function buildPassNavLectureDetailRows(
  bundle: PassNavBundle,
  subjectScope: '__avg' | string,
): PassNavLectureDetailRow[] {
  const lectureToSubject = new Map(bundle.lectures.map((l) => [l.id, l.subject_id]))
  const titleById = new Map(bundle.lectures.map((l) => [l.id, l.title]))
  const benchByLecture = new Map(bundle.benchLecture.map((b) => [b.lecture_id, b]))

  const out: PassNavLectureDetailRow[] = []
  for (const u of bundle.userLecture) {
    const sid = lectureToSubject.get(u.lecture_id)
    if (!sid) continue
    if (subjectScope !== '__avg' && sid !== subjectScope) continue
    const b = benchByLecture.get(u.lecture_id)
    out.push({
      lectureId: u.lecture_id,
      subjectId: sid,
      subjectName: passNavSubjectDisplayLabel(bundle, sid),
      lectureTitle: titleById.get(u.lecture_id) ?? `강의 (${u.lecture_id.slice(0, 8)}…)`,
      userCompletion: num(u.completion_rate),
      benchCompletion: b != null ? num(b.completion_rate) : null,
      userConsecutive: num(u.consecutive_learning_days),
      benchConsecutive: b != null ? num(b.consecutive_learning_days) : null,
    })
  }
  out.sort((a, b) => {
    if (subjectScope === '__avg') {
      const s = a.subjectName.localeCompare(b.subjectName, 'ko')
      if (s !== 0) return s
    }
    return a.lectureTitle.localeCompare(b.lectureTitle, 'ko')
  })
  return out
}

/** questions_bank 처방용: 격차가 큰 category_label (mastery·모의 JSON 통합 기준) */
export function getWeakestCategoryForPrescription(bundle: PassNavBundle): string | null {
  const rows = buildCategoryCompare(bundle)
  return rows[0]?.category_label ?? null
}

export function buildCategoryCompare(bundle: PassNavBundle): CategoryMasteryCompare[] {
  const rows = buildPassNavCategoryDetailRows(bundle, '__avg')
  const out: CategoryMasteryCompare[] = rows.map((r) => {
    const ua = r.userAccuracy
    const ut = r.userSolveTime
    const ba = r.benchAccuracy
    const bt = r.benchSolveTime
    const gapAccuracy = ba != null && ua != null ? ba - ua : null
    const gapTime = ut != null && bt != null ? ut - bt : null
    return {
      subject_id: r.subjectId,
      subject_name: r.subjectName,
      category_label: r.category_label,
      userAccuracy: ua,
      userSolveTime: ut,
      benchAccuracy: ba,
      benchSolveTime: bt,
      gapAccuracy,
      gapTime,
      traffic: trafficForPair(ua, ut, ba, bt),
    }
  })
  return out.sort((a, b) => (b.gapAccuracy ?? 0) - (a.gapAccuracy ?? 0))
}

function avgPositive(nums: number[]): number | null {
  const xs = nums.filter((x) => x > 0 && !Number.isNaN(x))
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function collectSubjectIdsForPassNavMetrics(bundle: PassNavBundle, catalogToSubject: Map<string, string>): string[] {
  const ids = new Set<string>()
  for (const s of bundle.subjects) ids.add(s.id)
  for (const u of bundle.userMastery) ids.add(u.subject_id)
  for (const b of bundle.benchMastery) ids.add(b.subject_id)
  for (const L of bundle.lectures) ids.add(L.subject_id)
  for (const m of bundle.userMock) {
    const sid = catalogToSubject.get(m.catalog_id)
    if (sid) ids.add(sid)
  }
  for (const m of bundle.benchMock) {
    const sid = catalogToSubject.get(m.catalog_id)
    if (sid) ids.add(sid)
  }
  return [...ids]
}

function avgFinite(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function collectBenchMockSolveTimesForSubject(
  bundle: PassNavBundle,
  subjectId: string,
  catalogToSubject: Map<string, string>,
): number[] {
  const vals: number[] = []
  for (const m of bundle.benchMock) {
    if (catalogToSubject.get(m.catalog_id) !== subjectId) continue
    const cats = parseMockCategoryDetailRecord(m.category_detail_benchmarks)
    if (cats.size > 0) {
      for (const v of cats.values()) {
        const t = v.avg_solve_time
        if (t != null && t > 0) vals.push(t)
      }
    } else {
      const t = num(m.target_avg_solve_time)
      if (t != null && t > 0) vals.push(t)
    }
  }
  return vals
}

function collectUserMockSolveTimesForSubject(
  bundle: PassNavBundle,
  subjectId: string,
  catalogToSubject: Map<string, string>,
): number[] {
  const vals: number[] = []
  for (const m of bundle.userMock) {
    if (catalogToSubject.get(m.catalog_id) !== subjectId) continue
    const cats = parseMockCategoryDetailRecord(m.category_detail_stats)
    if (cats.size > 0) {
      for (const v of cats.values()) {
        const t = v.avg_solve_time
        if (t != null && t > 0) vals.push(t)
      }
    } else {
      const t = num(m.private_avg_solve_time_per_prob)
      if (t != null && t > 0) vals.push(t)
    }
  }
  return vals
}

function collectBenchMockAccuraciesForSubject(
  bundle: PassNavBundle,
  subjectId: string,
  catalogToSubject: Map<string, string>,
): number[] {
  const vals: number[] = []
  for (const m of bundle.benchMock) {
    if (catalogToSubject.get(m.catalog_id) !== subjectId) continue
    const cats = parseMockCategoryDetailRecord(m.category_detail_benchmarks)
    if (cats.size > 0) {
      for (const v of cats.values()) {
        if (v.accuracy != null) vals.push(v.accuracy)
      }
    } else {
      const a = num(m.target_avg_accuracy)
      if (a != null) vals.push(a)
    }
  }
  return vals
}

function collectUserMockAccuraciesForSubject(
  bundle: PassNavBundle,
  subjectId: string,
  catalogToSubject: Map<string, string>,
): number[] {
  const vals: number[] = []
  for (const m of bundle.userMock) {
    if (catalogToSubject.get(m.catalog_id) !== subjectId) continue
    const cats = parseMockCategoryDetailRecord(m.category_detail_stats)
    if (cats.size > 0) {
      for (const v of cats.values()) {
        if (v.accuracy != null) vals.push(v.accuracy)
      }
    } else {
      const a = num(m.private_avg_accuracy)
      if (a != null) vals.push(a)
    }
  }
  return vals
}

/** 풀이속도·수강률·정답률(과목별). 정답률은 mastery·mock 각 평균 후 combineAvg. */
export function buildPassNavSubjectMetricRows(bundle: PassNavBundle): PassNavSubjectMetricRow[] {
  const catalogToSubject = new Map(bundle.catalogs.map((c) => [c.id, c.subject_id]))
  const lectureToSubject = new Map(bundle.lectures.map((l) => [l.id, l.subject_id]))

  const benchMasteryAvg = (subjectId: string): number | null => {
    const vals = bundle.benchMastery
      .filter((b) => b.subject_id === subjectId)
      .map((b) => num(b.target_solve_time))
      .filter((v): v is number => v != null && v > 0)
    return avgPositive(vals)
  }

  const benchMockAvg = (subjectId: string): number | null =>
    avgPositive(collectBenchMockSolveTimesForSubject(bundle, subjectId, catalogToSubject))

  const userMasteryAvg = (subjectId: string): number | null => {
    const vals = bundle.userMastery
      .filter((u) => u.subject_id === subjectId)
      .map((u) => num(u.avg_solve_time))
      .filter((v): v is number => v != null && v > 0)
    return avgPositive(vals)
  }

  const userMockAvg = (subjectId: string): number | null =>
    avgPositive(collectUserMockSolveTimesForSubject(bundle, subjectId, catalogToSubject))

  const benchCompletionAvg = (subjectId: string): number | null => {
    const vals: number[] = []
    for (const b of bundle.benchLecture) {
      if (lectureToSubject.get(b.lecture_id) !== subjectId) continue
      const c = num(b.completion_rate)
      if (c != null) vals.push(c)
    }
    return avgFinite(vals)
  }

  const userCompletionAvg = (subjectId: string): number | null => {
    const vals: number[] = []
    for (const u of bundle.userLecture) {
      if (lectureToSubject.get(u.lecture_id) !== subjectId) continue
      const c = num(u.completion_rate)
      if (c != null) vals.push(c)
    }
    return avgFinite(vals)
  }

  const benchMasteryAccuracyAvg = (subjectId: string): number | null => {
    const vals = bundle.benchMastery
      .filter((b) => b.subject_id === subjectId)
      .map((b) => num(b.target_accuracy))
      .filter((v): v is number => v != null)
    return avgFinite(vals)
  }

  const benchMockAccuracyAvg = (subjectId: string): number | null =>
    avgFinite(collectBenchMockAccuraciesForSubject(bundle, subjectId, catalogToSubject))

  const userMasteryAccuracyAvg = (subjectId: string): number | null => {
    const vals = bundle.userMastery
      .filter((u) => u.subject_id === subjectId)
      .map((u) => num(u.avg_accuracy))
      .filter((v): v is number => v != null)
    return avgFinite(vals)
  }

  const userMockAccuracyAvg = (subjectId: string): number | null =>
    avgFinite(collectUserMockAccuraciesForSubject(bundle, subjectId, catalogToSubject))

  const benchConsecutiveAvg = (subjectId: string): number | null => {
    const vals: number[] = []
    for (const b of bundle.benchLecture) {
      if (lectureToSubject.get(b.lecture_id) !== subjectId) continue
      const d = num(b.consecutive_learning_days)
      if (d != null) vals.push(d)
    }
    return avgFinite(vals)
  }

  const userConsecutiveAvg = (subjectId: string): number | null => {
    const vals: number[] = []
    for (const u of bundle.userLecture) {
      if (lectureToSubject.get(u.lecture_id) !== subjectId) continue
      const d = num(u.consecutive_learning_days)
      if (d != null) vals.push(d)
    }
    return avgFinite(vals)
  }

  const subjectIds = collectSubjectIdsForPassNavMetrics(bundle, catalogToSubject)
  subjectIds.sort((a, b) =>
    passNavSubjectDisplayLabel(bundle, a).localeCompare(passNavSubjectDisplayLabel(bundle, b), 'ko'),
  )

  return subjectIds.map((id) => ({
    subjectId: id,
    subjectName: passNavSubjectDisplayLabel(bundle, id),
    benchSec: combineAvg(benchMasteryAvg(id), benchMockAvg(id)),
    userSec: combineAvg(userMasteryAvg(id), userMockAvg(id)),
    benchCompletionPct: benchCompletionAvg(id),
    userCompletionPct: userCompletionAvg(id),
    benchAccuracyPct: combineAvg(benchMasteryAccuracyAvg(id), benchMockAccuracyAvg(id)),
    userAccuracyPct: combineAvg(userMasteryAccuracyAvg(id), userMockAccuracyAvg(id)),
    benchConsecutiveDays: benchConsecutiveAvg(id),
    userConsecutiveDays: userConsecutiveAvg(id),
  }))
}

/** SolveSpeedBarSection 전체(AVG)와 동일: 값 있는 과목만 산술평균 */
function meanAcrossSubjectMetrics(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v != null && !Number.isNaN(v))
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function clamp0100(x: number): number {
  return Math.min(100, Math.max(0, x))
}

/** 수강률·정답률 등: 벤치 대비 달성률(%). 벤치 없으면 사용자 값을 0~100으로 간주 */
function scoreHigherBetter(user: number | null, bench: number | null): number | null {
  if (user == null || Number.isNaN(user)) return null
  if (bench != null && bench > 0 && !Number.isNaN(bench)) {
    return clamp0100((user / bench) * 100)
  }
  return clamp0100(user)
}

/** 초 단위: 더 빠를수록 좋음 → benchSec/userSec 비율 */
function scoreSpeedVsBench(userSec: number | null, benchSec: number | null): number | null {
  if (userSec == null || !(userSec > 0) || Number.isNaN(userSec)) return null
  if (benchSec != null && benchSec > 0 && !Number.isNaN(benchSec)) {
    return clamp0100((benchSec / userSec) * 100)
  }
  return null
}

/** 연속 학습일: 벤치 대비 달성률. 벤치 없으면 일수×8을 0~100으로 스케일(구 레이더와 동일 계열) */
function scoreStreakVsBench(userDays: number | null, benchDays: number | null): number | null {
  if (userDays == null || Number.isNaN(userDays)) return null
  if (benchDays != null && benchDays > 0 && !Number.isNaN(benchDays)) {
    return clamp0100((userDays / benchDays) * 100)
  }
  return clamp0100(userDays * 8)
}

/**
 * 관제 센터 링: 과목 막대(SolveSpeedBarSection)와 같은 집계로
 * 풀이 속도·수강률·정답률·연속 학습일 각 25% 가중 (미산출 분은 0점으로 반영).
 */
export function passNavSubjectBarOverallPct(rows: PassNavSubjectMetricRow[]): number {
  if (rows.length === 0) return 0
  const sorted = [...rows].sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ko'))
  const avgBenchSec = meanAcrossSubjectMetrics(sorted.map((r) => r.benchSec))
  const avgUserSec = meanAcrossSubjectMetrics(sorted.map((r) => r.userSec))
  const avgBenchLec = meanAcrossSubjectMetrics(sorted.map((r) => r.benchCompletionPct))
  const avgUserLec = meanAcrossSubjectMetrics(sorted.map((r) => r.userCompletionPct))
  const avgBenchAcc = meanAcrossSubjectMetrics(sorted.map((r) => r.benchAccuracyPct))
  const avgUserAcc = meanAcrossSubjectMetrics(sorted.map((r) => r.userAccuracyPct))
  const avgBenchStreak = meanAcrossSubjectMetrics(sorted.map((r) => r.benchConsecutiveDays))
  const avgUserStreak = meanAcrossSubjectMetrics(sorted.map((r) => r.userConsecutiveDays))

  const sp = scoreSpeedVsBench(avgUserSec, avgBenchSec)
  const lec = scoreHigherBetter(avgUserLec, avgBenchLec)
  const acc = scoreHigherBetter(avgUserAcc, avgBenchAcc)
  const st = scoreStreakVsBench(avgUserStreak, avgBenchStreak)

  return 0.25 * (sp ?? 0) + 0.25 * (lec ?? 0) + 0.25 * (acc ?? 0) + 0.25 * (st ?? 0)
}

export function maxFocusDropRatio(bundle: PassNavBundle, prev: FocusSnapshot): number {
  let worst = 0
  for (const u of bundle.userLecture) {
    const cur = num(u.focus_score)
    const p = prev[u.lecture_id]
    if (cur == null || p == null || p <= 0) continue
    const ratio = 1 - cur / p
    if (ratio > worst) worst = ratio
  }
  return worst
}

export function hasDeviationStreak(bundle: PassNavBundle): boolean {
  if (bundle.userLecture.length === 0) return true
  const maxS = Math.max(...bundle.userLecture.map((u) => u.consecutive_learning_days ?? 0))
  return maxS <= DEVIATION_MAX_STREAK
}

export function recentAccuracyGapVsTarget(
  bundle: PassNavBundle,
  recent: { is_correct: boolean; category_label: string | null }[],
): { hit: boolean; rate: number; target: number | null } {
  const last = recent.slice(0, 10)
  if (last.length < 5) return { hit: false, rate: 0, target: null }
  const correct = last.filter((x) => x.is_correct).length
  const rate = (correct / last.length) * 100
  const cat = last.find((x) => x.category_label)?.category_label
  let target: number | null = null
  if (cat) {
    const row = bundle.benchMastery.find((b) => b.category_label === cat)
    target = row ? num(row.target_accuracy) : null
    if (target == null) {
      const accs: number[] = []
      for (const bm of bundle.benchMock) {
        const parsed = parseMockCategoryDetailRecord(bm.category_detail_benchmarks)
        const x = parsed.get(cat)?.accuracy
        if (x != null) accs.push(x)
      }
      if (accs.length > 0) target = accs.reduce((a, b) => a + b, 0) / accs.length
    }
  }
  if (target == null && bundle.benchMastery.length > 0) {
    let s = 0
    for (const b of bundle.benchMastery) s += num(b.target_accuracy) ?? 0
    target = s / bundle.benchMastery.length
  }
  const hit = target != null && rate < target - ACCURACY_ALERT_GAP_PP
  return { hit, rate, target }
}

/** 강의 단위로 짝지은 집중도 점수 평균(나 vs 목표 대학 벤치) */
export function summarizeFocusVsBench(bundle: PassNavBundle): { userAvg: number; benchAvg: number; n: number } | null {
  const benchByL = new Map(bundle.benchLecture.map((x) => [x.lecture_id, x]))
  let su = 0
  let sb = 0
  let n = 0
  for (const u of bundle.userLecture) {
    const b = benchByL.get(u.lecture_id)
    const uf = num(u.focus_score)
    const bf = b != null ? num(b.focus_score) : null
    if (uf == null || bf == null) continue
    su += uf
    sb += bf
    n += 1
  }
  return n > 0 ? { userAvg: su / n, benchAvg: sb / n, n } : null
}

/** SolveSpeedBarSection 과 동일한 과목별 집계로 벤치 대비 격차 한 줄 요약(알림 문구용) */
export type PassNavSubjectBenchSummaryLine = {
  subjectId: string
  subjectName: string
  score: number
  lines: string[]
}

export function buildPassNavSubjectBenchGapSummaries(bundle: PassNavBundle): PassNavSubjectBenchSummaryLine[] {
  if (!bundle.benchmarkId) return []
  const rows = buildPassNavSubjectMetricRows(bundle)
  const acc: PassNavSubjectBenchSummaryLine[] = []
  const completionGapPp = 10
  const accGapPp = 10

  for (const r of rows) {
    const lines: string[] = []
    let score = 0

    const bc = r.benchConsecutiveDays
    const uc = r.userConsecutiveDays
    if (bc != null && uc != null && (uc + 1e-6 < bc || uc <= DEVIATION_MAX_STREAK)) {
      const gap = bc - uc
      if (gap >= 0.5 || uc <= DEVIATION_MAX_STREAK) {
        lines.push(
          `연속으로 공부한 날: 목표 대학 합격군 평균은 ${bc.toFixed(1)}일인데, 나는 ${uc.toFixed(1)}일 수준이에요.`,
        )
        score += 5 + gap * 3
      }
    }

    const bs = r.benchSec
    const us = r.userSec
    if (bs != null && us != null && bs > 0 && us >= bs * STAGNATION_SLOW_RATIO) {
      lines.push(
        `문제당 평균 풀이 시간이 ${us.toFixed(1)}초로, 합격군 기준(${bs.toFixed(1)}초)보다 깁니다.`,
      )
      score += us / bs
    }

    const bcp = r.benchCompletionPct
    const ucp = r.userCompletionPct
    if (bcp != null && ucp != null && ucp + completionGapPp < bcp) {
      lines.push(
        `강의 수강률이 ${ucp.toFixed(1)}%인데, 합격군 평균은 ${bcp.toFixed(1)}% 정도로 잡혀 있어요.`,
      )
      score += (bcp - ucp) / 5
    }

    const ba = r.benchAccuracyPct
    const ua = r.userAccuracyPct
    if (ba != null && ua != null && ua + accGapPp < ba) {
      lines.push(
        `정답률이 ${ua.toFixed(1)}%로, 합격군이 보통 맞추는 수준(${ba.toFixed(1)}%)보다 낮아요.`,
      )
      score += (ba - ua) / 3
    }

    if (lines.length > 0) {
      acc.push({ subjectId: r.subjectId, subjectName: r.subjectName, score, lines })
    }
  }

  acc.sort((a, b) => b.score - a.score)
  return acc.slice(0, 6)
}

export function subjectSummaryCoversStreak(s: PassNavSubjectBenchSummaryLine): boolean {
  return s.lines.some((l) => l.includes('연속 학습일'))
}
