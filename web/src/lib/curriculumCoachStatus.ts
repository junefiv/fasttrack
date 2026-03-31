import type { FasttrackMockExamRow, FasttrackTestResultRow, SubjectRow } from '../types/fasttrack'

export type SubjectPillar = '국어' | '영어' | '수학'
export type MonthRound = '3' | '6' | '9'

export const SUBJECT_PILLARS_ORDER: SubjectPillar[] = ['국어', '영어', '수학']
const ROUNDS: MonthRound[] = ['3', '6', '9']

export function subjectPillarFromSubject(subject: SubjectRow): SubjectPillar | null {
  const n = subject.name.trim()
  const c = (subject.category ?? '').trim()
  if (/국어/.test(n) || /국어/.test(c)) return '국어'
  if (/영어/.test(n) || /영어/.test(c)) return '영어'
  if (/수학|미적|기하|확통|미적분|대수/.test(n) || /수학/.test(c)) return '수학'
  return null
}

/** 카탈로그 모의 집계·막대용: 국영수 + 사회·과학 탐구 구분(매칭 실패 시 null → 기타) */
export type CatalogMockPillar = SubjectPillar | '사회' | '과학'

export function catalogMockPillarFromSubject(subject: SubjectRow): CatalogMockPillar | null {
  const core = subjectPillarFromSubject(subject)
  if (core) return core
  const n = subject.name.trim()
  const c = (subject.category ?? '').trim()
  const hay = `${n} ${c}`
  if (/과학|화학|물리|생명|지구과학|과탐|생명과학|물리학|화학원리/i.test(hay)) return '과학'
  if (
    /사회|사탐|한국사|세계사|동아시아|경제와|정치와|사회문화|생활과\s*윤리|윤리와\s*사상|한국지리|세계지리|통합사회|행정법|국제법|교과사회|법과\s*사회/i.test(
      hay,
    )
  ) {
    return '사회'
  }
  return null
}

export function monthRoundFromExamDate(examDate: string): MonthRound | null {
  if (typeof examDate !== 'string' || examDate.length < 7) return null
  const m = parseInt(examDate.slice(5, 7), 10)
  if (!Number.isFinite(m)) return null
  if (m === 3) return '3'
  if (m === 6) return '6'
  if (m === 9) return '9'
  return null
}

export function scoreToPercentile(allScores: number[], myScore: number): number | null {
  if (allScores.length === 0) return null
  const below = allScores.filter((s) => s < myScore).length
  const equal = allScores.filter((s) => s === myScore).length
  return Math.round(((below + equal * 0.5) / allScores.length) * 1000) / 10
}

function bestUserScoreByExam(
  userResults: FasttrackTestResultRow[],
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of userResults) {
    if (r.test_type !== 'mock') continue
    const prev = m.get(r.reference_id)
    if (prev === undefined || r.score > prev) m.set(r.reference_id, r.score)
  }
  return m
}

function scoresByExamId(
  rows: { reference_id: string; score: number }[],
): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const row of rows) {
    const arr = map.get(row.reference_id) ?? []
    arr.push(row.score)
    map.set(row.reference_id, arr)
  }
  return map
}

export type MockCell = {
  examIds: string[]
  examNames: string[]
  myBestScore: number | null
  percentile: number | null
}

export type MockExamMatrixRow = {
  pillar: SubjectPillar
  cells: Record<MonthRound, MockCell>
  otherExams: { examId: string; name: string; myScore: number | null; percentile: number | null }[]
}

export function buildMockExamMatrix(
  subjects: SubjectRow[],
  exams: FasttrackMockExamRow[],
  userMockResults: FasttrackTestResultRow[],
  allScoresRows: { reference_id: string; score: number }[],
): { rows: MockExamMatrixRow[]; overallAvgPercentile: number | null; attemptCount: number } {
  const pillarBySubjectId = new Map<string, SubjectPillar>()
  for (const s of subjects) {
    const p = subjectPillarFromSubject(s)
    if (p) pillarBySubjectId.set(s.id, p)
  }

  const userBest = bestUserScoreByExam(userMockResults)
  const scoresMap = scoresByExamId(allScoresRows)

  const examsByPillarRound = new Map<string, FasttrackMockExamRow[]>()
  const examsByPillarOther = new Map<SubjectPillar, FasttrackMockExamRow[]>()

  for (const ex of exams) {
    const pillar = pillarBySubjectId.get(ex.subject_id)
    if (!pillar) continue
    const round = monthRoundFromExamDate(ex.exam_date)
    if (round) {
      const key = `${pillar}:${round}`
      const list = examsByPillarRound.get(key) ?? []
      list.push(ex)
      examsByPillarRound.set(key, list)
    } else {
      const list = examsByPillarOther.get(pillar) ?? []
      list.push(ex)
      examsByPillarOther.set(pillar, list)
    }
  }

  function cellFor(pillar: SubjectPillar, round: MonthRound): MockCell {
    const key = `${pillar}:${round}`
    const list = examsByPillarRound.get(key) ?? []
    const examIds = list.map((e) => e.id)
    const examNames = list.map((e) => e.name)
    let myBestScore: number | null = null
    const percentiles: number[] = []
    for (const e of list) {
      const mine = userBest.get(e.id)
      const scores = scoresMap.get(e.id) ?? []
      if (mine !== undefined) {
        if (myBestScore === null || mine > myBestScore) myBestScore = mine
        const p = scoreToPercentile(scores, mine)
        if (p !== null) percentiles.push(p)
      }
    }
    const percentile =
      percentiles.length > 0
        ? Math.round((percentiles.reduce((a, b) => a + b, 0) / percentiles.length) * 10) / 10
        : null
    return { examIds, examNames, myBestScore, percentile }
  }

  const rows: MockExamMatrixRow[] = SUBJECT_PILLARS_ORDER.map((pillar) => {
    const cells = {
      '3': cellFor(pillar, '3'),
      '6': cellFor(pillar, '6'),
      '9': cellFor(pillar, '9'),
    } as Record<MonthRound, MockCell>
    const others = examsByPillarOther.get(pillar) ?? []
    const otherExams = others.map((e) => {
      const mine = userBest.get(e.id)
      const scores = scoresMap.get(e.id) ?? []
      const percentile =
        mine !== undefined ? scoreToPercentile(scores, mine) : null
      return {
        examId: e.id,
        name: e.name,
        myScore: mine ?? null,
        percentile,
      }
    })
    return { pillar, cells, otherExams }
  })

  const attemptCount = userMockResults.filter((r) => r.test_type === 'mock').length
  const collected: number[] = []
  for (const row of rows) {
    for (const r of ROUNDS) {
      const c = row.cells[r]
      if (c.percentile !== null) collected.push(c.percentile)
    }
    for (const o of row.otherExams) {
      if (o.percentile !== null) collected.push(o.percentile)
    }
  }
  const overallAvgPercentile =
    collected.length > 0
      ? Math.round((collected.reduce((a, b) => a + b, 0) / collected.length) * 10) / 10
      : null

  return { rows, overallAvgPercentile, attemptCount }
}

export type MockCatalogAccuracyBar = {
  catalogId: string
  pillar: CatalogMockPillar | null
  pillarLabel: string
  examLabel: string
  correct: number
  total: number
  accuracyPercent: number
}

/** 막대 차트 섹션 순서(국→영→수→사→과, 이후 과목명·기타) */
export const MOCK_CATALOG_PILLAR_SECTION_ORDER: CatalogMockPillar[] = [
  '국어',
  '영어',
  '수학',
  '사회',
  '과학',
]

/** 카탈로그 문항 제출 집계 → 과목(기둥)·시험 시리즈별 정답률 막대용 데이터 */
export function buildMockCatalogAccuracyBars(
  subjects: SubjectRow[],
  stats: {
    catalogId: string
    title: string
    subject_id: string
    correct: number
    total: number
  }[],
): MockCatalogAccuracyBar[] {
  const nameById = new Map(subjects.map((s) => [s.id, s.name]))
  const pillarRank: Record<CatalogMockPillar, number> = {
    국어: 0,
    영어: 1,
    수학: 2,
    사회: 3,
    과학: 4,
  }
  return stats
    .map((s) => {
      const subj = subjects.find((x) => x.id === s.subject_id)
      const pillar = subj ? catalogMockPillarFromSubject(subj) : null
      const pillarLabel = pillar ?? nameById.get(s.subject_id) ?? '기타'
      const acc = s.total > 0 ? Math.round((s.correct * 1000) / s.total) / 10 : 0
      return {
        catalogId: s.catalogId,
        pillar,
        pillarLabel,
        examLabel: s.title,
        correct: s.correct,
        total: s.total,
        accuracyPercent: acc,
      }
    })
    .sort((a, b) => {
      const pa = a.pillar !== null ? pillarRank[a.pillar] : 99
      const pb = b.pillar !== null ? pillarRank[b.pillar] : 99
      if (pa !== pb) return pa - pb
      return a.examLabel.localeCompare(b.examLabel, 'ko')
    })
}

/** 카드 요약용 집계 축 */
export type MockSummaryPillar = CatalogMockPillar | '기타'

/** 누적 제출 건수 기준(막대 차트와 동일). pillar 미매칭은 기타 */
export function aggregateMockCatalogPillarTotals(
  bars: MockCatalogAccuracyBar[],
): Record<MockSummaryPillar, { correct: number; total: number }> {
  const z = (): { correct: number; total: number } => ({ correct: 0, total: 0 })
  const out: Record<MockSummaryPillar, { correct: number; total: number }> = {
    국어: z(),
    영어: z(),
    수학: z(),
    사회: z(),
    과학: z(),
    기타: z(),
  }
  for (const b of bars) {
    const p = b.pillar
    if (p === null) {
      out.기타.correct += b.correct
      out.기타.total += b.total
    } else {
      out[p].correct += b.correct
      out[p].total += b.total
    }
  }
  return out
}

export function formatMockCatalogPillarSummaryLine(bars: MockCatalogAccuracyBar[]): string {
  if (bars.length === 0) {
    return '아직 카탈로그 모의고사 문항 제출 기록이 없습니다.'
  }
  const submissionTotal = bars.reduce((s, b) => s + b.total, 0)
  if (submissionTotal === 0) {
    return '아직 카탈로그 모의고사 문항 제출 기록이 없습니다.'
  }
  const agg = aggregateMockCatalogPillarTotals(bars)
  const order: MockSummaryPillar[] = [...MOCK_CATALOG_PILLAR_SECTION_ORDER]
  if (agg.기타.total > 0) order.push('기타')
  return order
    .map((name) => {
      const { correct, total } = agg[name]
      if (total === 0) return `${name} 총 정답률 —`
      const pct = Math.round((correct * 1000) / total) / 10
      return `${name} 총 정답률 ${pct}% (${correct}/${total})`
    })
    .join(' · ')
}

/** 정답률 구간으로 리그 라벨 (데모 티어) */
export function bankLeagueFromAccuracy(accuracyPercent: number | null): {
  leagueName: string
  leagueSize: number
  rank: number
} {
  if (accuracyPercent === null) {
    return { leagueName: '측정 전', leagueSize: 0, rank: 0 }
  }
  const tiers = [
    { min: 90, name: '플래티넘 리그', size: 120 },
    { min: 80, name: '골드 리그', size: 380 },
    { min: 70, name: '실버 리그', size: 620 },
    { min: 60, name: '브론즈 리그', size: 540 },
    { min: 0, name: '스타터 리그', size: 410 },
  ]
  const t = tiers.find((x) => accuracyPercent >= x.min) ?? tiers[tiers.length - 1]
  const seed = Math.floor(accuracyPercent * 100) % 97
  const rank = Math.max(1, Math.min(t.size, Math.round((t.size * (100 - accuracyPercent)) / 100) + seed))
  return { leagueName: t.name, leagueSize: t.size, rank }
}

/** 목표 대학 + 오늘 날짜 기반 동월동일 선배 수강 진행률 데모(중앙값) */
export function demoPeerLectureMedianPercent(
  targetUniversity: string,
  refDate = new Date(),
): number {
  let h = 0
  for (let i = 0; i < targetUniversity.length; i++) h = (h * 31 + targetUniversity.charCodeAt(i)) | 0
  const dom = refDate.getDate()
  const base = 42 + (Math.abs(h) % 28) + (dom % 7)
  return Math.min(92, Math.max(38, base))
}
