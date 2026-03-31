import type { CatalogMockProblemLatestRow } from './fasttrackQueries'

export type MockAxisRollup = {
  key: string
  correct: number
  total: number
  accuracyPercent: number
}

export type MockStrengthWeakness = {
  strengths: MockAxisRollup[]
  weaknesses: MockAxisRollup[]
}

const MIN_ATTEMPTS_DEFAULT = 2
const STRENGTH_AT_LEAST = 70
const WEAKNESS_BELOW = 50

function sortRollupsByVolumeThenKey(a: MockAxisRollup, b: MockAxisRollup): number {
  if (b.total !== a.total) return b.total - a.total
  return a.key.localeCompare(b.key, 'ko')
}

export function rollupMockProblemsByCategory(items: CatalogMockProblemLatestRow[]): MockAxisRollup[] {
  const m = new Map<string, { correct: number; total: number }>()
  for (const it of items) {
    const k = it.categoryLabel?.trim() || '분류 없음'
    const cur = m.get(k) ?? { correct: 0, total: 0 }
    cur.total += 1
    if (it.isCorrect) cur.correct += 1
    m.set(k, cur)
  }
  return [...m.entries()]
    .map(([key, v]) => ({
      key,
      correct: v.correct,
      total: v.total,
      accuracyPercent: v.total > 0 ? Math.round((v.correct * 1000) / v.total) / 10 : 0,
    }))
    .sort(sortRollupsByVolumeThenKey)
}

export function rollupMockProblemsByTag(items: CatalogMockProblemLatestRow[]): MockAxisRollup[] {
  const m = new Map<string, { correct: number; total: number }>()
  for (const it of items) {
    const tagSet = new Set(it.tags.length ? it.tags : ['(태그 없음)'])
    for (const tag of tagSet) {
      const k = tag.trim() || '(태그 없음)'
      const cur = m.get(k) ?? { correct: 0, total: 0 }
      cur.total += 1
      if (it.isCorrect) cur.correct += 1
      m.set(k, cur)
    }
  }
  return [...m.entries()]
    .map(([key, v]) => ({
      key,
      correct: v.correct,
      total: v.total,
      accuracyPercent: v.total > 0 ? Math.round((v.correct * 1000) / v.total) / 10 : 0,
    }))
    .sort(sortRollupsByVolumeThenKey)
}

export function inferStrengthWeaknessFromRollups(
  rollups: MockAxisRollup[],
  options?: { minAttempts?: number; strengthAtLeast?: number; weaknessBelow?: number },
): MockStrengthWeakness {
  const minAttempts = options?.minAttempts ?? MIN_ATTEMPTS_DEFAULT
  const strengthAtLeast = options?.strengthAtLeast ?? STRENGTH_AT_LEAST
  const weaknessBelow = options?.weaknessBelow ?? WEAKNESS_BELOW
  const eligible = rollups.filter((r) => r.total >= minAttempts)
  const strengths = eligible
    .filter((r) => r.accuracyPercent >= strengthAtLeast)
    .sort((a, b) => b.accuracyPercent - a.accuracyPercent || b.total - a.total)
  const weaknesses = eligible
    .filter((r) => r.accuracyPercent < weaknessBelow)
    .sort((a, b) => a.accuracyPercent - b.accuracyPercent || b.total - a.total)
  return { strengths, weaknesses }
}

export type MockProblemCatalogGroup = {
  catalogId: string
  title: string
  subjectId: string
  correct: CatalogMockProblemLatestRow[]
  wrong: CatalogMockProblemLatestRow[]
}

export function groupMockProblemsByCatalog(
  items: CatalogMockProblemLatestRow[],
): MockProblemCatalogGroup[] {
  const m = new Map<string, CatalogMockProblemLatestRow[]>()
  for (const it of items) {
    const arr = m.get(it.catalogId) ?? []
    arr.push(it)
    m.set(it.catalogId, arr)
  }
  const byQ = (a: CatalogMockProblemLatestRow, b: CatalogMockProblemLatestRow) =>
    a.questionNumber - b.questionNumber
  return [...m.values()]
    .map((rows) => {
      const first = rows[0]
      const correct = rows.filter((r) => r.isCorrect).sort(byQ)
      const wrong = rows.filter((r) => !r.isCorrect).sort(byQ)
      return {
        catalogId: first.catalogId,
        title: first.catalogTitle,
        subjectId: first.subjectId,
        correct,
        wrong,
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
}
