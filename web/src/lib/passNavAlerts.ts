import { lectureBrowseDeepLink } from './lectureVideosNav'
import { questionsBankDrillPath } from './questionsBankNav'
import type { PassNavBundle, PassNavCategoryRemedy, PassNavDbAlertRow } from '../types/passNav'
import {
  buildCategoryCompare,
  buildPassNavSubjectBenchGapSummaries,
  hasDeviationStreak,
  maxFocusDropRatio,
  passNavSubjectDisplayLabel,
  recentAccuracyGapVsTarget,
  subjectSummaryCoversStreak,
  summarizeFocusVsBench,
} from './passNavModel'
import {
  ACCURACY_ALERT_GAP_PP,
  STAGNATION_SLOW_RATIO,
  TRAFFIC_GREEN_ACCURACY_DELTA,
} from './passNavThresholds'
import type { FocusSnapshot } from './passNavFocusStorage'

function num(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(Number(v))) return null
  return Number(v)
}

/** DB가 0–1 또는 0–100 둘 다일 수 있어 통일 */
function normPct(v: number | null | undefined): number | null {
  const x = num(v)
  if (x == null) return null
  if (x >= 0 && x <= 1) return x * 100
  return x
}

function formatRelativeKo(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const diffMs = Date.now() - t
  if (diffMs < 0) return '방금'
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return '방금'
  if (mins < 60) return `${mins}분 전`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `${hrs}시간 전`
  const days = Math.floor(hrs / 24)
  return `${days}일 전`
}

const FALLBACK_TIMES = ['방금', '10분 전', '2시간 전', '1일 전', '3일 전', '1주일 전'] as const

const PERF_CATEGORY_GAP_PP = 10

const MAX_CATEGORY_PERF_ALERTS = 12
const MAX_STAGNATION_ALERTS = 12
const MAX_LECTURE_ACTION_ALERTS = 8

export type PassNavHistoryPillar = 'behavioral' | 'performance' | 'stagnation' | 'action'

export type PassNavHistoryTone = 'danger' | 'warn' | 'success'

export type PassNavHistoryItem = {
  id: string
  pillar: PassNavHistoryPillar
  pillarLabel: string
  title: string
  body: string
  tone: PassNavHistoryTone
  occurredAt: string | null
  /** UI용 상대 시각 (데이터 없으면 순서 기반 가짜 라벨) */
  displayTime: string
  actionLabel?: string
  actionHref?: string
  /** 강의·교재·문제은행 딥링크 (bundle.categoryRemedies 등에서 조립) */
  remedy: PassNavCategoryRemedy | null
}

const PILLAR_LABEL: Record<PassNavHistoryPillar, string> = {
  behavioral: '학습 습관 이탈',
  performance: '성취도 이탈',
  stagnation: '속도 정체',
  action: '추천 경로 미이행',
}

type HistoryDraft = Omit<PassNavHistoryItem, 'displayTime' | 'remedy'> & {
  sortMs: number | null
  remedyCategoryLabel: string | null
}

function resolveRemedy(bundle: PassNavBundle, label: string | null): PassNavCategoryRemedy | null {
  if (label && bundle.categoryRemedies[label]) return bundle.categoryRemedies[label]
  const w = bundle.weakCategoryLabel
  if (w && bundle.categoryRemedies[w]) return bundle.categoryRemedies[w]
  const vals = Object.values(bundle.categoryRemedies)
  return vals[0] ?? null
}

function mergeRecentRemedy(
  recent: PassNavCategoryRemedy | null,
  cat: PassNavCategoryRemedy | null,
): PassNavCategoryRemedy | null {
  if (!recent && !cat) return null
  if (!cat) return recent
  if (!recent) return cat
  return {
    category_label: recent.category_label,
    videoHref: recent.videoHref ?? cat.videoHref,
    ebookHref: recent.ebookHref ?? cat.ebookHref,
    drillHref: recent.drillHref?.includes('question=')
      ? recent.drillHref
      : (cat.drillHref ?? recent.drillHref ?? null),
    videoHint: recent.videoHint ?? cat.videoHint,
    ebookHint: recent.ebookHint ?? cat.ebookHint,
    drillHint: recent.drillHint ?? cat.drillHint,
  }
}

function overlayPrescriptionDrill(
  base: PassNavCategoryRemedy | null,
  presc: PassNavCategoryRemedy | null,
): PassNavCategoryRemedy | null {
  if (!presc?.drillHref?.includes('question=')) return base
  if (!base) return presc
  return {
    ...base,
    drillHref: presc.drillHref,
    drillHint: presc.drillHint ?? base.drillHint,
  }
}

export type PassNavAlert = {
  id: string
  severity: 'high' | 'medium'
  title: string
  body: string
  actionLabel?: string
  actionHref?: string
}

export function buildPassNavAlerts(
  bundle: PassNavBundle,
  prevFocus: FocusSnapshot,
): PassNavAlert[] {
  const alerts: PassNavAlert[] = []
  const compares = buildCategoryCompare(bundle)
  const benchLinked = Boolean(bundle.benchmarkId)
  const summaries = buildPassNavSubjectBenchGapSummaries(bundle)

  for (const s of summaries.slice(0, 2)) {
    alerts.push({
      id: `subj-bench-${s.subjectId}`,
      severity: 'high',
      title: `${s.subjectName} · 선배 평균과 비교`,
      body: `${s.lines.join(' ')} (위 과목 막대 차트와 같은 기준입니다.)`,
      actionLabel: '강의 목록',
      actionHref: '/study/videos',
    })
  }

  for (const c of compares) {
    const ut = c.userSolveTime
    const bt = c.benchSolveTime
    if (ut != null && bt != null && bt > 0 && ut >= bt * STAGNATION_SLOW_RATIO) {
      alerts.push({
        id: `stagnation-${c.subject_id}-${c.category_label}`,
        severity: 'medium',
        title: '정체 경보',
        body: `「${c.subject_name}」 과목의 「${c.category_label}」 유형에서 문제 하나 푸는 데 평균 ${ut.toFixed(1)}초가 걸립니다. 선배들의 평균 풀이 시간은 약 ${bt.toFixed(1)}초인데, 그보다 한참 더 느린 편이에요.`,
        actionLabel: '문제 은행',
        actionHref: '/study/mock-exam/questions-bank',
      })
      break
    }
  }

  const drop = maxFocusDropRatio(bundle, prevFocus)
  const focusPair = summarizeFocusVsBench(bundle)
  const streakExplainedBySummary = benchLinked && summaries.some(subjectSummaryCoversStreak)

  if (hasDeviationStreak(bundle) && !streakExplainedBySummary) {
    alerts.push({
      id: 'deviation-streak',
      severity: 'high',
      title: '연속 학습일 경보',
      body: benchLinked
        ? '지금 수강 중인 강의만 보면, 연속으로 학습한 날이 길어도 하루 이하예요. 위에 과목별 요약에 ‘연속 학습’이 안 나오면 강의가 과목에 잘 묶였는지 한번 확인해 보세요.'
        : '선배 비교 데이터가 아직 연결되지 않았어요. 그래도 기록만 보면 연속으로 공부한 날이 거의 없습니다.',
      actionLabel: '강의 목록',
      actionHref: '/study/videos',
    })
  }

  if (drop >= 0.3) {
    const pct = (drop * 100).toFixed(0)
    const tail =
      benchLinked && focusPair && focusPair.n > 0
        ? ` 같은 강의들만 모아 보면, 선배들의 평균 집중도는 ${focusPair.benchAvg.toFixed(1)}점인데 내 평균은 ${focusPair.userAvg.toFixed(1)}점이에요(${focusPair.n}개 강의 기준).`
        : ''
    alerts.push({
      id: 'deviation-focus',
      severity: 'high',
      title: '집중도 급락',
      body: `강의 ‘집중도’ 점수가 직전에 볼 때보다 약 ${pct}% 가라앉았어요.${tail}`,
      actionLabel: '강의 목록',
      actionHref: '/study/videos',
    })
  }

  const acc = recentAccuracyGapVsTarget(
    bundle,
    bundle.recentAttempts.map((r) => ({ is_correct: r.is_correct, category_label: r.category_label })),
  )
  if (acc.hit && acc.target != null) {
    const wrong = bundle.recentAttempts.find((r) => !r.is_correct && r.source === 'catalog')
    alerts.push({
      id: 'accuracy',
      severity: 'high',
      title: '정확도 경보',
      body: `최근에 푼 문제 ${Math.min(10, bundle.recentAttempts.length)}개만 놓고 보면 정답률이 ${acc.rate.toFixed(0)}%예요. 선배들의 평균 정답률 ${acc.target.toFixed(0)}%보다 ${ACCURACY_ALERT_GAP_PP}%p 이상 낮습니다.`,
      actionLabel: wrong?.ebook_page_id ? '복습 자료' : '모의고사',
      actionHref: wrong?.lecture_caption_id ? `/study/videos` : '/study/mock-exam',
    })
  }

  return alerts
}

export function buildPassNavAlertHistory(
  bundle: PassNavBundle,
  prevFocus: FocusSnapshot,
): PassNavHistoryItem[] {
  const drafts: HistoryDraft[] = []
  const now = Date.now()
  const compares = buildCategoryCompare(bundle)
  const benchLinked = Boolean(bundle.benchmarkId)
  const subjectBenchSummaries = buildPassNavSubjectBenchGapSummaries(bundle)
  const streakExplainedBySummary = benchLinked && subjectBenchSummaries.some(subjectSummaryCoversStreak)
  const catById = new Map(bundle.catalogs.map((c) => [c.id, c.title]))
  const titleById = new Map(bundle.lectures.map((l) => [l.id, l.title]))
  const userByLecture = new Map(bundle.userLecture.map((u) => [u.lecture_id, u]))

  for (const s of subjectBenchSummaries) {
    drafts.push({
      id: `subj-bench-${s.subjectId}`,
      pillar: 'behavioral',
      pillarLabel: PILLAR_LABEL.behavioral,
      title: `${s.subjectName} · 선배 평균과 비교`,
      body: `${s.lines.join(' ')} 위 과목 막대 차트와 같은 기준으로 본 거예요.`,
      tone: 'danger',
      occurredAt: null,
      sortMs: null,
      remedyCategoryLabel: bundle.weakCategoryLabel,
      actionLabel: '강의 목록',
      actionHref: '/study/videos',
    })
  }

  if (hasDeviationStreak(bundle) && !streakExplainedBySummary) {
    drafts.push({
      id: 'bhv-streak',
      pillar: 'behavioral',
      pillarLabel: PILLAR_LABEL.behavioral,
      title: '연속 학습일 경보',
      body: benchLinked
        ? '지금 수강 중인 강의만 보면, 연속으로 학습한 날이 길어도 하루 이하예요. 과목별 요약에 연속 학습이 안 잡히면 강의가 과목에 잘 묶였는지 확인해 보세요.'
        : '선배 비교 데이터가 아직 연결되지 않았어요. 그래도 기록만 보면 연속으로 공부한 날이 거의 없습니다.',
      tone: 'danger',
      occurredAt: null,
      sortMs: null,
      remedyCategoryLabel: null,
      actionLabel: '강의 목록',
      actionHref: '/study/videos',
    })
  }

  const focusDrop = maxFocusDropRatio(bundle, prevFocus)
  const focusPair = summarizeFocusVsBench(bundle)
  if (focusDrop >= 0.3) {
    const pct = (focusDrop * 100).toFixed(0)
    const tail =
      benchLinked && focusPair && focusPair.n > 0
        ? ` 같은 강의들만 모아 보면 선배들의 평균 집중도는 ${focusPair.benchAvg.toFixed(1)}점, 내 평균은 ${focusPair.userAvg.toFixed(1)}점이에요(${focusPair.n}개 강의 기준).`
        : ''
    drafts.push({
      id: 'bhv-focus',
      pillar: 'behavioral',
      pillarLabel: PILLAR_LABEL.behavioral,
      title: '집중도 급락',
      body: `강의 ‘집중도’ 점수가 직전에 볼 때보다 약 ${pct}% 가라앉았어요.${tail} 짧은 복습 강의로 환기해 보세요.`,
      tone: 'danger',
      occurredAt: null,
      sortMs: null,
      remedyCategoryLabel: null,
      actionLabel: '강의 목록',
      actionHref: '/study/videos',
    })
  }

  let latestWatchMs: number | null = null
  let latestWatchIso: string | null = null
  for (const u of bundle.userLecture) {
    if (!u.last_watched_at) continue
    const t = new Date(u.last_watched_at).getTime()
    if (Number.isNaN(t)) continue
    if (latestWatchMs == null || t > latestWatchMs) {
      latestWatchMs = t
      latestWatchIso = u.last_watched_at
    }
  }
  if (latestWatchMs != null && now - latestWatchMs >= 48 * 3600 * 1000) {
    drafts.push({
      id: 'bhv-absence',
      pillar: 'behavioral',
      pillarLabel: PILLAR_LABEL.behavioral,
      title: '장기 미접속',
      body: '학습 기록이 48시간 이상 없습니다. 경로 이탈을 막기 위해 오늘 1강만이라도 이어가세요.',
      tone: 'danger',
      occurredAt: latestWatchIso,
      sortMs: latestWatchMs,
      remedyCategoryLabel: null,
      actionLabel: '강의 목록',
      actionHref: '/study/videos',
    })
  }

  const accGapRows = compares
    .filter((c) => {
      const ua = c.userAccuracy
      const ba = c.benchAccuracy
      if (ua == null || ba == null) return false
      return ba - ua >= PERF_CATEGORY_GAP_PP
    })
    .sort((a, b) => (b.gapAccuracy ?? 0) - (a.gapAccuracy ?? 0))
    .slice(0, MAX_CATEGORY_PERF_ALERTS)

  for (const c of accGapRows) {
    const ua = c.userAccuracy!
    const ba = c.benchAccuracy!
    const gap = ba - ua
    drafts.push({
      id: `perf-acc-${c.subject_id}-${c.category_label}`,
      pillar: 'performance',
      pillarLabel: PILLAR_LABEL.performance,
      title: '정확도 경보',
      body: `「${c.subject_name}」 과목의 「${c.category_label}」 유형에서 내 정답률은 ${ua.toFixed(1)}%인데, 선배들의 평균 정답률(${ba.toFixed(1)}%)보다 ${gap.toFixed(0)}%p 낮아요.`,
      tone: gap >= 15 ? 'danger' : 'warn',
      occurredAt: null,
      sortMs: null,
      remedyCategoryLabel: c.category_label,
      actionLabel: '문제 은행',
      actionHref: '/study/mock-exam/questions-bank',
    })
  }

  const acc = recentAccuracyGapVsTarget(
    bundle,
    bundle.recentAttempts.map((r) => ({ is_correct: r.is_correct, category_label: r.category_label })),
  )
  if (acc.hit && acc.target != null) {
    const lastAttempt = bundle.recentAttempts[0]
    const at = lastAttempt?.submitted_at ?? null
    const sortMs = at ? new Date(at).getTime() : NaN
    const cat = bundle.recentAttempts.find((r) => r.category_label)?.category_label
    drafts.push({
      id: 'perf-recent-acc',
      pillar: 'performance',
      pillarLabel: PILLAR_LABEL.performance,
      title: '정답률 급락 (최근 제출)',
      body: `최근에 푼 문제 기준 정답률이 ${acc.rate.toFixed(0)}%예요. 선배들의 평균 정답률 ${acc.target.toFixed(0)}%보다 ${ACCURACY_ALERT_GAP_PP}%p 이상 낮습니다.${cat ? ` 관련 유형: 「${cat}」` : ''}`,
      tone: 'danger',
      occurredAt: at,
      sortMs: Number.isFinite(sortMs) ? sortMs : null,
      remedyCategoryLabel: cat ?? null,
      actionLabel: '모의고사',
      actionHref: '/study/mock-exam',
    })
  }

  if (benchLinked) {
  for (const u of bundle.userMock) {
    const b = bundle.benchMock.find((x) => x.catalog_id === u.catalog_id)
    if (!b) continue
    const ua = num(u.private_avg_accuracy)
    const ta = num(b.target_avg_accuracy)
    if (ua != null && ta != null && ua < ta) {
      drafts.push({
        id: `perf-mock-${u.catalog_id}`,
        pillar: 'performance',
        pillarLabel: PILLAR_LABEL.performance,
        title: '모의고사 정답률 미달',
        body: `「${catById.get(u.catalog_id) ?? '모의고사'}」에서 내 평균 정답률은 ${ua.toFixed(1)}%인데, 선배들의 평균 정답률은 ${ta.toFixed(1)}%예요.`,
        tone: 'warn',
        occurredAt: null,
        sortMs: null,
        remedyCategoryLabel: null,
        actionLabel: '모의고사',
        actionHref: '/study/mock-exam',
      })
    }
  }
  }

  if (benchLinked) {
  for (const u of bundle.userOfficial) {
    const b = bundle.benchOfficial.find((x) => x.exam_name === u.exam_name && x.subject_id === u.subject_id)
    if (!b) continue
    const us = num(u.total_score)
    const ts = num(b.target_total_score)
    if (us != null && ts != null && us < ts) {
      const upMs = u.updated_at ? new Date(u.updated_at).getTime() : NaN
      drafts.push({
        id: `perf-official-${u.id}`,
        pillar: 'performance',
        pillarLabel: PILLAR_LABEL.performance,
        title: '기출 성적 이탈',
        body: `「${u.exam_name}」(${passNavSubjectDisplayLabel(bundle, u.subject_id)})에서 내 점수는 ${us.toFixed(0)}점인데, 목표는 ${ts.toFixed(0)}점이에요.`,
        tone: 'danger',
        occurredAt: u.updated_at,
        sortMs: Number.isFinite(upMs) ? upMs : null,
        remedyCategoryLabel: null,
      })
    }
  }
  }

  const slowRows = compares
    .filter((c) => {
      const ut = c.userSolveTime
      const bt = c.benchSolveTime
      if (ut == null || bt == null || bt <= 0) return false
      return ut >= bt * STAGNATION_SLOW_RATIO
    })
    .sort((a, b) => {
      const ra =
        a.userSolveTime != null && a.benchSolveTime != null && a.benchSolveTime > 0
          ? a.userSolveTime / a.benchSolveTime
          : 0
      const rb =
        b.userSolveTime != null && b.benchSolveTime != null && b.benchSolveTime > 0
          ? b.userSolveTime / b.benchSolveTime
          : 0
      return rb - ra
    })
    .slice(0, MAX_STAGNATION_ALERTS)

  for (const c of slowRows) {
    const ut = c.userSolveTime!
    const bt = c.benchSolveTime!
    const sec = Math.round(ut - bt)
    drafts.push({
      id: `stag-${c.subject_id}-${c.category_label}`,
      pillar: 'stagnation',
      pillarLabel: PILLAR_LABEL.stagnation,
      title: '정체 경보',
      body: `「${c.subject_name}」 과목의 「${c.category_label}」 유형은(는) 문제 하나당 평균 ${ut.toFixed(1)}초가 걸립니다. 선배들의 평균 풀이 시간(${bt.toFixed(1)}초)보다 약 ${sec}초 더 걸리는 셈이라, 속도를 끌어올릴 여지가 있어요.`,
      tone: 'warn',
      occurredAt: null,
      sortMs: null,
      remedyCategoryLabel: c.category_label,
      actionLabel: '문제 은행',
      actionHref: '/study/mock-exam/questions-bank',
    })
  }

  if (benchLinked) {
  for (const u of bundle.userMock) {
    const b = bundle.benchMock.find((x) => x.catalog_id === u.catalog_id)
    if (!b) continue
    const ut = num(u.private_avg_solve_time_per_prob)
    const tt = num(b.target_avg_solve_time)
    if (ut != null && tt != null && ut > tt * STAGNATION_SLOW_RATIO) {
      drafts.push({
        id: `stag-mocktime-${u.catalog_id}`,
        pillar: 'stagnation',
        pillarLabel: PILLAR_LABEL.stagnation,
        title: '모의고사 풀이 속도 지연',
        body: `「${catById.get(u.catalog_id) ?? '모의고사'}」에서 문항 하나당 내 평균 풀이 시간은 ${ut.toFixed(1)}초인데, 선배들의 평균 풀이 시간(${tt.toFixed(1)}초)보다 한참 더 걸리고 있어요.`,
        tone: 'warn',
        occurredAt: null,
        sortMs: null,
        remedyCategoryLabel: null,
        actionLabel: '모의고사',
        actionHref: '/study/mock-exam',
      })
    }
  }
  }

  const lectureAlerts: HistoryDraft[] = []
  if (benchLinked) {
  for (const b of bundle.benchLecture) {
    const bp = normPct(b.completion_rate)
    if (bp == null || bp < 90) continue
    const u = userByLecture.get(b.lecture_id)
    const up = u ? normPct(u.completion_rate) : null
    if (u == null || up == null || up < 30) {
      const lw = u?.last_watched_at
      const lwMs = lw ? new Date(lw).getTime() : NaN
      lectureAlerts.push({
        id: `act-lecture-${b.lecture_id}`,
        pillar: 'action',
        pillarLabel: PILLAR_LABEL.action,
        title: '필수 강의 누락',
        body: `선배 중 90% 이상이 완강한 「${titleById.get(b.lecture_id) ?? '핵심 강의'}」인데, 나의 수강 진도는 30%도 안 되었거나 아직 거의 시작하지 않았어요.`,
        tone: 'warn',
        occurredAt: lw ?? null,
        sortMs: Number.isFinite(lwMs) ? lwMs : null,
        remedyCategoryLabel: null,
        actionLabel: '강의 목록',
        actionHref: '/study/videos',
      })
    }
  }
  }
  drafts.push(...lectureAlerts.slice(0, MAX_LECTURE_ACTION_ALERTS))

  const reds = compares.filter((c) => c.traffic === 'red')
  const firstRedLabel = reds[0]?.category_label ?? bundle.weakCategoryLabel ?? null
  if (reds.length > 0 && bundle.bankQuestionsForWeakTags.length > 0) {
    const labels = [...new Set(reds.map((r) => r.category_label))].slice(0, 3).join(', ')
    drafts.push({
      id: 'act-curation',
      pillar: 'action',
      pillarLabel: PILLAR_LABEL.action,
      title: '취약 보완 큐 미이행',
      body: `정답률·속도 기준으로 많이 밀리는 유형(${labels}${reds.length > 3 ? ' 등' : ''})이 있는데, 문제은행에서 골라 둔 추천 문항을 아직 충분히 풀지 않은 것 같아요.`,
      tone: 'warn',
      occurredAt: null,
      sortMs: null,
      remedyCategoryLabel: firstRedLabel,
      actionLabel: '문제 은행',
      actionHref: '/study/mock-exam/questions-bank',
    })
  }

  const killerQs = bundle.bankQuestionsForWeakTags.filter((q) =>
    (q.tags ?? []).some((t) => /killer|高난도|킬러/i.test(String(t))),
  )
  if (killerQs.length > 0) {
    drafts.push({
      id: 'act-killer',
      pillar: 'action',
      pillarLabel: PILLAR_LABEL.action,
      title: '킬러·고난도 태그 취약',
      body: '추천 문제 목록에 난이도가 높은 문항이 들어 있어요. 목표가 상위권이면 그 유형을 따로 집중해서 푸는 게 좋습니다.',
      tone: 'warn',
      occurredAt: null,
      sortMs: null,
      remedyCategoryLabel: firstRedLabel,
      actionLabel: '문제 은행',
      actionHref: '/study/mock-exam/questions-bank',
    })
  }

  const seen = new Set<string>()
  const unique = drafts.filter((x) => {
    if (seen.has(x.id)) return false
    seen.add(x.id)
    return true
  })

  const withTs = unique.filter((x): x is HistoryDraft & { sortMs: number } => x.sortMs != null)
  const withoutTs = unique.filter((x) => x.sortMs == null)
  withTs.sort((a, b) => b.sortMs - a.sortMs)
  const ordered = [...withTs, ...withoutTs]

  let fbIdx = 0
  const threadItems: PassNavHistoryItem[] = ordered.map((row) => {
    const { sortMs: _s, remedyCategoryLabel, ...restBase } = row
    const displayTime =
      formatRelativeKo(restBase.occurredAt) ?? FALLBACK_TIMES[Math.min(fbIdx++, FALLBACK_TIMES.length - 1)]
    let remedy: PassNavCategoryRemedy | null = null
    if (restBase.id === 'perf-recent-acc') {
      remedy = mergeRecentRemedy(bundle.recentAttemptRemedy, resolveRemedy(bundle, remedyCategoryLabel))
    } else if (restBase.id === 'act-curation' || restBase.id === 'act-killer') {
      remedy = overlayPrescriptionDrill(resolveRemedy(bundle, remedyCategoryLabel), bundle.prescriptionRemedy)
    } else {
      remedy = resolveRemedy(bundle, remedyCategoryLabel)
    }
    return { ...restBase, displayTime, remedy }
  })

  const win = compares.find(
    (c) =>
      c.userAccuracy != null &&
      c.benchAccuracy != null &&
      c.userAccuracy >= c.benchAccuracy + TRAFFIC_GREEN_ACCURACY_DELTA,
  )
  const successBlock: PassNavHistoryItem | null = win
    ? {
        id: 'success-highlight',
        pillar: 'performance',
        pillarLabel: '개선 · 유지',
        title: '복귀 성공',
        body: `「${win.subject_name}」 과목의 「${win.category_label}」 유형 정답률이 선배들의 평균보다 ${(win.userAccuracy! - win.benchAccuracy!).toFixed(0)}%p 더 높아요. 지금 리듬을 유지하면 좋겠습니다.`,
        tone: 'success',
        occurredAt: null,
        displayTime: '최근',
        remedy: resolveRemedy(bundle, win.category_label),
      }
    : null

  return successBlock ? [...threadItems, successBlock] : threadItems
}

/**
 * SegmentedControl로 고른 지망의 `bundle.benchmarkId`에 해당하는 알림만 남긴다.
 * - `benchmark_id`가 있으면 현재 번들 기준과 일치할 때만 포함.
 * - 구버전/INSERT 누락으로 `benchmark_id`가 없으면, 같은 벤치의 강좌 코호트(`benchLecture`)에
 *   포함된 `related_lecture_id`인 경우만 포함(필수경로 누락 등).
 */
export function filterPassNavDbAlertsForActiveBenchmark(
  rows: PassNavDbAlertRow[],
  bundle: PassNavBundle,
): PassNavDbAlertRow[] {
  const bid = bundle.benchmarkId
  const benchLectureIds = new Set(bundle.benchLecture.map((b) => b.lecture_id))

  return rows.filter((r) => {
    if (r.benchmark_id != null && r.benchmark_id !== '') {
      if (bid == null || bid === '') return false
      return r.benchmark_id === bid
    }
    if (r.related_lecture_id && benchLectureIds.has(r.related_lecture_id)) return true
    if (bid != null && bid !== '') return false
    return true
  })
}

/** 관제 센터 `이탈 경보 히스토리` — `public.alerts` 행을 스레드 카드 형식으로 변환 */
export function mapPassNavDbAlertsToHistoryItems(
  bundle: PassNavBundle,
  rows: PassNavDbAlertRow[],
): PassNavHistoryItem[] {
  return rows.map((row) => {
    const code = row.alert_code ?? ''
    let pillar: PassNavHistoryPillar = 'performance'
    if (code === 'required_path_missing') pillar = 'action'
    else if (code === 'mastery_stagnation_solve' || code === 'mock_stagnation_solve') pillar = 'stagnation'

    const tone: PassNavHistoryTone =
      code === 'required_path_missing' ||
      code === 'mastery_perf_accuracy_gap' ||
      code === 'mock_perf_accuracy'
        ? 'danger'
        : 'warn'

    const cl = row.category_label
    const remedyLabel =
      cl && !cl.startsWith('lecture:') && !cl.startsWith('catalog:') ? cl : null
    const baseRemedy = resolveRemedy(bundle, remedyLabel)

    let remedy: PassNavCategoryRemedy | null = null
    if (baseRemedy) {
      remedy = {
        ...baseRemedy,
        videoHref: lectureBrowseDeepLink(row.related_lecture_id),
        ebookHref: row.related_ebook_page_id ? '/ebook' : null,
        drillHref: questionsBankDrillPath({
          subjectId: row.subject_id,
          questionId: row.related_question_id,
        }),
      }
    } else if (row.related_lecture_id || row.related_ebook_page_id || row.related_question_id) {
      remedy = {
        category_label: remedyLabel ?? row.alert_code ?? 'alert',
        videoHref: lectureBrowseDeepLink(row.related_lecture_id),
        ebookHref: row.related_ebook_page_id ? '/ebook' : null,
        drillHref: questionsBankDrillPath({
          subjectId: row.subject_id,
          questionId: row.related_question_id,
        }),
        videoHint: null,
        ebookHint: null,
        drillHint: null,
      }
    }

    const displayTime = formatRelativeKo(row.created_at) ?? '—'

    return {
      id: row.id,
      pillar,
      pillarLabel: PILLAR_LABEL[pillar],
      title: row.title,
      body: row.body,
      tone,
      occurredAt: row.created_at,
      displayTime,
      remedy,
    }
  })
}
