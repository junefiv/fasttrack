import type { FasttrackMockExamRow, FasttrackTestResultRow, SubjectRow } from '../types/fasttrack'

export type SubjectPillar = '국어' | '영어' | '수학'
export type MonthRound = '3' | '6' | '9'

const PILLARS: SubjectPillar[] = ['국어', '영어', '수학']
const ROUNDS: MonthRound[] = ['3', '6', '9']

export function subjectPillarFromSubject(subject: SubjectRow): SubjectPillar | null {
  const n = subject.name.trim()
  const c = (subject.category ?? '').trim()
  if (/국어/.test(n) || /국어/.test(c)) return '국어'
  if (/영어/.test(n) || /영어/.test(c)) return '영어'
  if (/수학|미적|기하|확통|미적분|대수/.test(n) || /수학/.test(c)) return '수학'
  return null
}

export function monthRoundFromExamDate(examDate: string): MonthRound | null {
  const m = parseInt(examDate.slice(5, 7), 10)
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

  const rows: MockExamMatrixRow[] = PILLARS.map((pillar) => {
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
