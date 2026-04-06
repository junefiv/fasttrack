import type { PassNavHistoryItem } from './passNavAlerts'
import { buildPassNavCategoryDetailRows, buildPassNavLectureDetailRows } from './passNavModel'
import { buildPassNavStudyTrendForReport, buildPassNavStudyTrendTextBody } from './passNavStudyTrendData'
import type { PassNavBundle, PassNavSubjectMetricRow } from '../types/passNav'

export type PassNavNavigatorReportSection = {
  id: string
  title: string
  body: string
}

export type PassNavNavigatorGeminiSummary = {
  majorStrengths: string[]
  majorWeaknesses: string[]
  fomoSuggestions: string[]
  strongFomoRecommendation: string
}

const MAX_CATEGORY_PAYLOAD = 55
const MAX_LECTURE_PAYLOAD = 75
const MAX_ALERT_PAYLOAD = 36

function meanAcrossSubjects(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v != null && !Number.isNaN(v))
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function fmtSec(v: number | null): string {
  return v != null && !Number.isNaN(v) ? `${v.toFixed(1)}초` : '—'
}

function fmtPct(v: number | null): string {
  return v != null && !Number.isNaN(v) ? `${v.toFixed(1)}%` : '—'
}

function fmtDays(v: number | null): string {
  return v != null && !Number.isNaN(v) ? `${v.toFixed(1)}일` : '—'
}

function line(parts: string[]): string {
  return parts.join(' · ')
}

function accGapPct(user: number | null, bench: number | null): number | null {
  if (user == null || bench == null || Number.isNaN(user) || Number.isNaN(bench)) return null
  return bench - user
}

function timeGapSec(user: number | null, bench: number | null): number | null {
  if (user == null || bench == null || !(user > 0) || !(bench > 0)) return null
  return user - bench
}

/** 링·막대와 동일 원시 지표 섹션만 (AI 요약은 별도) */
export function buildPassNavNavigatorDataSections(input: {
  bundle: PassNavBundle
  subjectMetricRows: PassNavSubjectMetricRow[]
  alertHistory: PassNavHistoryItem[]
  overallPct: number
  dDay: number
  goalLabel: string
  hasBenchmark: boolean
}): PassNavNavigatorReportSection[] {
  const { bundle, subjectMetricRows, alertHistory, overallPct, dDay, goalLabel, hasBenchmark } = input
  const sorted = [...subjectMetricRows].sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ko'))

  const avgBenchSec = meanAcrossSubjects(sorted.map((r) => r.benchSec))
  const avgUserSec = meanAcrossSubjects(sorted.map((r) => r.userSec))
  const avgBenchLec = meanAcrossSubjects(sorted.map((r) => r.benchCompletionPct))
  const avgUserLec = meanAcrossSubjects(sorted.map((r) => r.userCompletionPct))
  const avgBenchAcc = meanAcrossSubjects(sorted.map((r) => r.benchAccuracyPct))
  const avgUserAcc = meanAcrossSubjects(sorted.map((r) => r.userAccuracyPct))
  const avgBenchStreak = meanAcrossSubjects(sorted.map((r) => r.benchConsecutiveDays))
  const avgUserStreak = meanAcrossSubjects(sorted.map((r) => r.userConsecutiveDays))

  const summaryBody = [
    `목표: ${goalLabel}`,
    `D-Day: ${dDay}일`,
    `종합 지수(막대·링 동일 집계·4지표 각 25%): ${overallPct.toFixed(1)}점`,
    hasBenchmark ? '벤치마크: 연결됨' : '벤치마크: 미연결(일부 지표는 절대값·제한적 비교)',
    '',
    '【전체 과목 평균】',
    line([
      `풀이 속도 나/벤치 ${fmtSec(avgUserSec)}/${fmtSec(avgBenchSec)}`,
      `수강률 ${fmtPct(avgUserLec)}/${fmtPct(avgBenchLec)}`,
      `정답률 ${fmtPct(avgUserAcc)}/${fmtPct(avgBenchAcc)}`,
      `연속 학습일 ${fmtDays(avgUserStreak)}/${fmtDays(avgBenchStreak)}`,
    ]),
  ].join('\n')

  const perSubjectLines = sorted.map((r) =>
    line([
      r.subjectName,
      `속도 ${fmtSec(r.userSec)}/${fmtSec(r.benchSec)}`,
      `수강 ${fmtPct(r.userCompletionPct)}/${fmtPct(r.benchCompletionPct)}`,
      `정답 ${fmtPct(r.userAccuracyPct)}/${fmtPct(r.benchAccuracyPct)}`,
      `연속 ${fmtDays(r.userConsecutiveDays)}/${fmtDays(r.benchConsecutiveDays)}`,
    ]),
  )
  const perSubjectBody =
    sorted.length === 0
      ? '과목 단위 지표가 없습니다.'
      : ['과목명 · 나/벤치 (속도·수강률·정답률·연속일)', ...perSubjectLines].join('\n')

  const catRows = buildPassNavCategoryDetailRows(bundle, '__avg')
  const catLines = catRows.map((r) => {
    const gAcc = accGapPct(r.userAccuracy, r.benchAccuracy)
    const gT = timeGapSec(r.userSolveTime, r.benchSolveTime)
    const accS =
      gAcc != null ? `정답격차 ${gAcc >= 0 ? `벤치보다 ${gAcc.toFixed(1)}%p 낮음` : `벤치보다 ${Math.abs(gAcc).toFixed(1)}%p 높음`}` : '정답 —'
    const tS =
      gT != null
        ? `속도 ${gT >= 0 ? `벤치보다 ${gT.toFixed(1)}초 느림` : `벤치보다 ${Math.abs(gT).toFixed(1)}초 빠름`}`
        : '속도 —'
    return `${r.subjectName} / ${r.category_label}: ${accS}, ${tS} (나 ${fmtSec(r.userSolveTime)}·${r.userAccuracy != null ? `${r.userAccuracy.toFixed(1)}%` : '—'} / 벤치 ${fmtSec(r.benchSolveTime)}·${r.benchAccuracy != null ? `${r.benchAccuracy.toFixed(1)}%` : '—'})`
  })
  const categoryBody =
    catLines.length === 0
      ? '카테고리별 마스터리·모의고사 JSON 기준 행이 없습니다.'
      : ['【카테고리별】 (막대 클릭 모달과 동일 출처)', ...catLines].join('\n')

  const lecRows = buildPassNavLectureDetailRows(bundle, '__avg')
  const lecLines = lecRows.map((r) => {
    const cg =
      r.userCompletion != null && r.benchCompletion != null
        ? `수강 ${r.userCompletion.toFixed(1)}% / ${r.benchCompletion.toFixed(1)}%`
        : '수강 —'
    const sg =
      r.userConsecutive != null && r.benchConsecutive != null
        ? `연속 ${r.userConsecutive.toFixed(1)}일 / ${r.benchConsecutive.toFixed(1)}일`
        : '연속 —'
    return `${r.subjectName} · ${r.lectureTitle}: ${cg}, ${sg}`
  })
  const lectureBody =
    lecLines.length === 0
      ? '강의별 수강·연속일 행이 없습니다.'
      : ['【강의별】 (막대 클릭 강의 탭과 동일 출처)', ...lecLines].join('\n')

  const alertLines = alertHistory.slice(0, 40).map((a) => {
    const t = a.displayTime ? `[${a.displayTime}] ` : ''
    return `${t}[${a.pillarLabel}] ${a.title}\n  ${a.body.replace(/\n/g, ' ')}`
  })
  const alertsBody =
    alertLines.length === 0
      ? '이탈·경보 히스토리가 없습니다.'
      : ['최근 최대 40건', ...alertLines].join('\n\n')

  const studyTrendBody = buildPassNavStudyTrendTextBody(bundle, sorted)

  return [
    { id: 'summary', title: '요약', body: summaryBody },
    { id: 'per-subject', title: '과목별 지표 (나 / 벤치)', body: perSubjectBody },
    { id: 'study-trend', title: '과목별 추이 (수강·문제·풀이시간, 일·월)', body: studyTrendBody },
    { id: 'category', title: '카테고리별 벤치 대비', body: categoryBody },
    { id: 'lecture', title: '강의별 수강·연속 학습', body: lectureBody },
    { id: 'alerts', title: '이탈·경보 히스토리', body: alertsBody },
  ]
}

export function buildPassNavNavigatorGeminiPayload(input: {
  bundle: PassNavBundle
  subjectMetricRows: PassNavSubjectMetricRow[]
  alertHistory: PassNavHistoryItem[]
  overallPct: number
  dDay: number
  goalLabel: string
  hasBenchmark: boolean
}): Record<string, unknown> {
  const sorted = [...input.subjectMetricRows].sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ko'))
  const avgBenchSec = meanAcrossSubjects(sorted.map((r) => r.benchSec))
  const avgUserSec = meanAcrossSubjects(sorted.map((r) => r.userSec))
  const avgBenchLec = meanAcrossSubjects(sorted.map((r) => r.benchCompletionPct))
  const avgUserLec = meanAcrossSubjects(sorted.map((r) => r.userCompletionPct))
  const avgBenchAcc = meanAcrossSubjects(sorted.map((r) => r.benchAccuracyPct))
  const avgUserAcc = meanAcrossSubjects(sorted.map((r) => r.userAccuracyPct))
  const avgBenchStreak = meanAcrossSubjects(sorted.map((r) => r.benchConsecutiveDays))
  const avgUserStreak = meanAcrossSubjects(sorted.map((r) => r.userConsecutiveDays))

  const catRows = buildPassNavCategoryDetailRows(input.bundle, '__avg').slice(0, MAX_CATEGORY_PAYLOAD)
  const lecRows = buildPassNavLectureDetailRows(input.bundle, '__avg').slice(0, MAX_LECTURE_PAYLOAD)
  const alerts = input.alertHistory.slice(0, MAX_ALERT_PAYLOAD).map((a) => ({
    pillarLabel: a.pillarLabel,
    tone: a.tone,
    title: a.title,
    body: a.body.slice(0, 400),
    displayTime: a.displayTime,
  }))

  return {
    generatedAt: new Date().toISOString(),
    goalLabel: input.goalLabel,
    dDay: input.dDay,
    overallPct: input.overallPct,
    hasBenchmark: input.hasBenchmark,
    averages: {
      solveTimeSecUser: avgUserSec,
      solveTimeSecBench: avgBenchSec,
      completionPctUser: avgUserLec,
      completionPctBench: avgBenchLec,
      accuracyPctUser: avgUserAcc,
      accuracyPctBench: avgBenchAcc,
      consecutiveDaysUser: avgUserStreak,
      consecutiveDaysBench: avgBenchStreak,
    },
    subjects: sorted.map((r) => ({
      name: r.subjectName,
      solveTimeSecUser: r.userSec,
      solveTimeSecBench: r.benchSec,
      completionPctUser: r.userCompletionPct,
      completionPctBench: r.benchCompletionPct,
      accuracyPctUser: r.userAccuracyPct,
      accuracyPctBench: r.benchAccuracyPct,
      consecutiveDaysUser: r.userConsecutiveDays,
      consecutiveDaysBench: r.benchConsecutiveDays,
    })),
    categories: catRows.map((r) => ({
      subject: r.subjectName,
      category: r.category_label,
      userSolveSec: r.userSolveTime,
      benchSolveSec: r.benchSolveTime,
      userAccuracyPct: r.userAccuracy,
      benchAccuracyPct: r.benchAccuracy,
      accuracyGapBenchMinusUser:
        r.userAccuracy != null && r.benchAccuracy != null ? r.benchAccuracy - r.userAccuracy : null,
    })),
    lectures: lecRows.map((r) => ({
      subject: r.subjectName,
      lectureTitle: r.lectureTitle,
      userCompletionPct: r.userCompletion,
      benchCompletionPct: r.benchCompletion,
      userConsecutiveDays: r.userConsecutive,
      benchConsecutiveDays: r.benchConsecutive,
    })),
    alerts,
    studyTrend: buildPassNavStudyTrendForReport(input.bundle, sorted),
    notesForModel: [
      'solveTimeSec: 낮을수록 빠른 풀이. 벤치 대비 사용자가 느리면 약점 후보.',
      'completionPct·accuracyPct·consecutiveDays: 벤치 대비 낮으면 약점 후보.',
      'alerts.tone danger/warn은 이탈·경보, success는 완화·회복 신호.',
      '목록은 토큰 한도로 잘렸을 수 있음.',
      'studyTrend.fromBundle: 현재 유저·벤치마크 번들에서 추출한 일·월 구간별 시계열(원시 일자 데이터 없음 — 구간 평균을 동일 값으로 펼침).',
      'studyTrend.chartDemoUi: UI 차트 「과목별 추이 (데모)」와 동일한 참고용 데모 수치. fromBundle과 함께 해석하되 사용자별 판단은 fromBundle·상위 subjects 필드를 우선.',
    ],
  }
}

/** 문자열 리터럴을 고려해 첫 루트 `{ ... }` 구간만 잘라냄 (lastIndexOf(`}`)는 문자열 안 `}`에 깨질 수 있음) */
function extractBalancedJsonObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (esc) {
      esc = false
      continue
    }
    if (inStr) {
      if (c === '\\') {
        esc = true
        continue
      }
      if (c === '"') {
        inStr = false
        continue
      }
      continue
    }
    if (c === '"') {
      inStr = true
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/** ```json ... ``` 가 응답 중간에 있어도 잡음 (^$ 전체 매칭 불필요) */
function stripMarkdownJsonFence(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (m) return m[1].trim()
  return text.trim()
}

/** 모델이 자주 내는 후행 쉼표 등만 최소 보정 */
function tryRepairJson(s: string): string {
  let t = s.replace(/^\uFEFF/, '').trim()
  t = t.replace(/,\s*([}\]])/g, '$1')
  return t
}

/**
 * 완전한 JSON이 아닐 때(토큰 잘림 등) 키 뒤 배열에서 닫힌 문자열만 스캔해 복구.
 * 마지막 항목이 중간에 끊기면 그 항목은 버림.
 */
function extractJsonStringArrayForKey(text: string, key: string): string[] {
  const needle = `"${key}"`
  const idx = text.indexOf(needle)
  if (idx < 0) return []
  let i = idx + needle.length
  while (i < text.length && /\s/.test(text[i])) i++
  if (text[i] !== ':') return []
  i++
  while (i < text.length && /\s/.test(text[i])) i++
  if (text[i] !== '[') return []
  i++
  const out: string[] = []
  while (i < text.length) {
    while (i < text.length && /[\s,\n\r]/.test(text[i])) i++
    if (text[i] === ']') break
    if (text[i] !== '"') break
    i++
    let acc = ''
    let closed = false
    while (i < text.length) {
      const c = text[i]
      if (c === '\\') {
        acc += c + (text[i + 1] ?? '')
        i += 2
        continue
      }
      if (c === '"') {
        out.push(acc)
        i++
        closed = true
        break
      }
      acc += c
      i++
    }
    if (!closed) break
  }
  return out
}

function extractJsonStringScalarForKey(text: string, key: string): string | null {
  const needle = `"${key}"`
  const idx = text.indexOf(needle)
  if (idx < 0) return null
  let i = idx + needle.length
  while (i < text.length && /\s/.test(text[i])) i++
  if (text[i] !== ':') return null
  i++
  while (i < text.length && /\s/.test(text[i])) i++
  if (text[i] !== '"') return null
  i++
  let acc = ''
  while (i < text.length) {
    const c = text[i]
    if (c === '\\') {
      acc += c + (text[i + 1] ?? '')
      i += 2
      continue
    }
    if (c === '"') return acc
    acc += c
    i++
  }
  return acc.trim().length > 0 ? acc : null
}

const TRUNC_NOTE = '(이하 응답이 출력 한도로 잘려 생략됨 — 불릿을 짧게 하거나 다시 생성하세요.)'

function trySalvageTruncatedNavigatorJson(raw: string): PassNavNavigatorGeminiSummary | null {
  const text = stripMarkdownJsonFence(raw.replace(/^\uFEFF/, '').trim())
  const majorStrengths = extractJsonStringArrayForKey(text, 'majorStrengths')
  const majorWeaknesses = extractJsonStringArrayForKey(text, 'majorWeaknesses')
  const fomoSuggestions = extractJsonStringArrayForKey(text, 'fomoSuggestions')
  const strongRaw = extractJsonStringScalarForKey(text, 'strongFomoRecommendation')

  const hasAny =
    majorStrengths.length > 0 ||
    majorWeaknesses.length > 0 ||
    fomoSuggestions.length > 0 ||
    (strongRaw != null && strongRaw.length > 0)
  if (!hasAny) return null

  return {
    majorStrengths: majorStrengths.length > 0 ? majorStrengths : [TRUNC_NOTE],
    majorWeaknesses: majorWeaknesses.length > 0 ? majorWeaknesses : [TRUNC_NOTE],
    fomoSuggestions: fomoSuggestions.length > 0 ? fomoSuggestions : [TRUNC_NOTE],
    strongFomoRecommendation:
      strongRaw && strongRaw.trim().length > 0
        ? strongRaw.trim()
        : '출력이 중간에 잘렸습니다. 「네비게이터 리포트 생성」을 다시 눌러 주세요.',
  }
}

function tryParseJsonObject(raw: string): unknown {
  const trimmed = raw.replace(/^\uFEFF/, '').trim()
  const attempts: string[] = []
  attempts.push(trimmed)
  attempts.push(stripMarkdownJsonFence(trimmed))
  const bal = extractBalancedJsonObject(attempts[attempts.length - 1])
  if (bal) attempts.push(bal)
  const bal2 = extractBalancedJsonObject(trimmed)
  if (bal2 && !attempts.includes(bal2)) attempts.push(bal2)

  let lastErr: Error | null = null
  for (const candidate of attempts) {
    const repaired = tryRepairJson(candidate)
    for (const slice of [candidate, repaired]) {
      if (!slice) continue
      try {
        return JSON.parse(slice)
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e))
      }
    }
  }
  const preview = trimmed.slice(0, 320).replace(/\s+/g, ' ')
  const hint = lastErr?.message ? ` (${lastErr.message})` : ''
  throw new Error(
    `Gemini 응답을 JSON으로 파싱하지 못했습니다.${hint} 미리보기: ${preview}${trimmed.length > 320 ? '…' : ''}`,
  )
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((i) => typeof i === 'string')
}

/** 단일 문자열로 온 경우 줄 단위로 배열화 (모델이 배열 대신 문자열로 줄 때) */
function coerceStringArray(x: unknown, field: string): string[] {
  if (isStringArray(x)) return x
  if (typeof x === 'string') {
    return x
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
      .filter(Boolean)
  }
  throw new Error(`Gemini JSON의 ${field}는 문자열 배열이거나 줄바꿈 문자열이어야 합니다.`)
}

export function parsePassNavNavigatorGeminiJson(raw: string): PassNavNavigatorGeminiSummary {
  let parsed: unknown
  try {
    parsed = tryParseJsonObject(raw)
  } catch (eFirst) {
    const salvaged = trySalvageTruncatedNavigatorJson(raw)
    if (salvaged) return salvaged
    throw eFirst instanceof Error ? eFirst : new Error(String(eFirst))
  }
  if (parsed == null || typeof parsed !== 'object') {
    throw new Error('Gemini JSON 루트가 객체가 아닙니다.')
  }
  const o = parsed as Record<string, unknown>
  let majorStrengths: string[]
  let majorWeaknesses: string[]
  let fomoSuggestions: string[]
  try {
    majorStrengths = coerceStringArray(o.majorStrengths, 'majorStrengths')
    majorWeaknesses = coerceStringArray(o.majorWeaknesses, 'majorWeaknesses')
    fomoSuggestions = coerceStringArray(o.fomoSuggestions, 'fomoSuggestions')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`${msg} (받은 키: ${Object.keys(o).join(', ') || '없음'})`)
  }
  const strongRaw = o.strongFomoRecommendation
  const strongFomoRecommendation =
    typeof strongRaw === 'string'
      ? strongRaw.trim()
      : strongRaw != null
        ? String(strongRaw).trim()
        : ''
  if (!strongFomoRecommendation) {
    throw new Error(
      `Gemini JSON에 strongFomoRecommendation 문자열이 필요합니다. (받은 키: ${Object.keys(o).join(', ') || '없음'})`,
    )
  }
  return {
    majorStrengths,
    majorWeaknesses,
    fomoSuggestions,
    strongFomoRecommendation,
  }
}

export function passNavigatorAiSectionsFromSummary(s: PassNavNavigatorGeminiSummary): PassNavNavigatorReportSection[] {
  const bullets = (xs: string[]) => xs.map((x) => `· ${x}`).join('\n')
  return [
    { id: 'ai-strengths', title: '주요 강점 (Gemini)', body: bullets(s.majorStrengths) },
    { id: 'ai-weaknesses', title: '주요 약점 (Gemini)', body: bullets(s.majorWeaknesses) },
    { id: 'ai-fomo', title: 'FOMO 제안 (Gemini)', body: bullets(s.fomoSuggestions) },
    {
      id: 'ai-strong-fomo',
      title: '강력 추천 FOMO (Gemini)',
      body: s.strongFomoRecommendation,
    },
  ]
}

export function buildPassNavNavigatorReportPlainText(sections: PassNavNavigatorReportSection[]): string {
  return sections.map((s) => `${s.title}\n${'—'.repeat(24)}\n${s.body}`).join('\n\n\n')
}
