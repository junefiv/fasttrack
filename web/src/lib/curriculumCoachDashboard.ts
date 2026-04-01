import type { FasttrackStudentStatRow } from '../types/fasttrack'

export type SubjectStudySummary = {
  subjectId: string
  subjectName: string
  totalAttempts: number
  correctCount: number
  /** 0–100, 풀이 0이면 null */
  accuracyPercent: number | null
}

export type WeakChapterSummary = {
  subjectId: string
  subjectName: string
  chapterId: string
  chapterName: string
  totalAttempts: number
  correctCount: number
  accuracyPercent: number
  weaknessScore: number
}

/** 과목별로 total_attempts / correct_count 합산 */
export function aggregateStatsBySubject(
  rows: FasttrackStudentStatRow[],
  subjectNameById: Map<string, string>,
): SubjectStudySummary[] {
  const m = new Map<string, { attempts: number; correct: number }>()
  for (const r of rows) {
    const cur = m.get(r.subject_id) ?? { attempts: 0, correct: 0 }
    cur.attempts += r.total_attempts
    cur.correct += r.correct_count
    m.set(r.subject_id, cur)
  }
  const list: SubjectStudySummary[] = []
  for (const [subjectId, v] of m) {
    const accuracyPercent =
      v.attempts > 0 ? Math.round((v.correct * 1000) / v.attempts) / 10 : null
    list.push({
      subjectId,
      subjectName: subjectNameById.get(subjectId) ?? subjectId,
      totalAttempts: v.attempts,
      correctCount: v.correct,
      accuracyPercent,
    })
  }
  return list.sort((a, b) => b.totalAttempts - a.totalAttempts)
}

/** `questions_bank_results` 등 과목별 집계를 fasttrack 학생 통계와 합산 */
export function mergeQuestionsBankTotalsIntoSubjectSummaries(
  summaries: SubjectStudySummary[],
  bankBySubject: { subjectId: string; correct: number; total: number }[],
  subjectNameById: Map<string, string>,
): SubjectStudySummary[] {
  const map = new Map<string, SubjectStudySummary>()
  for (const s of summaries) {
    map.set(s.subjectId, { ...s })
  }
  for (const b of bankBySubject) {
    const prev = map.get(b.subjectId)
    const totalAttempts = (prev?.totalAttempts ?? 0) + b.total
    const correctCount = (prev?.correctCount ?? 0) + b.correct
    map.set(b.subjectId, {
      subjectId: b.subjectId,
      subjectName: prev?.subjectName ?? subjectNameById.get(b.subjectId) ?? b.subjectId,
      totalAttempts,
      correctCount,
      accuracyPercent:
        totalAttempts > 0 ? Math.round((correctCount * 1000) / totalAttempts) / 10 : null,
    })
  }
  return [...map.values()].sort((a, b) => b.totalAttempts - a.totalAttempts)
}

/**
 * 챕터 단위로 합산 후 정답률이 낮은 순(동률이면 시도 수 많은 순).
 * chapter_id 없는 행은 제외.
 */
export function pickWeakChapters(
  rows: FasttrackStudentStatRow[],
  subjectNameById: Map<string, string>,
  chapterNameById: Map<string, string>,
  limit = 6,
  minAttempts = 2,
): WeakChapterSummary[] {
  type Agg = { attempts: number; correct: number; weaknessSum: number; weaknessN: number }
  const m = new Map<string, Agg & { subjectId: string }>()
  for (const r of rows) {
    if (!r.chapter_id) continue
    const key = `${r.subject_id}:${r.chapter_id}`
    const cur = m.get(key) ?? {
      subjectId: r.subject_id,
      attempts: 0,
      correct: 0,
      weaknessSum: 0,
      weaknessN: 0,
    }
    cur.attempts += r.total_attempts
    cur.correct += r.correct_count
    cur.weaknessSum += r.weakness_score
    cur.weaknessN += 1
    m.set(key, cur)
  }

  const out: WeakChapterSummary[] = []
  for (const [key, v] of m) {
    if (v.attempts < minAttempts) continue
    const [, chapterId] = key.split(':')
    const accuracyPercent = Math.round((v.correct * 1000) / v.attempts) / 10
    const weaknessScore =
      v.weaknessN > 0 ? Math.round((v.weaknessSum * 10) / v.weaknessN) / 10 : 0
    out.push({
      subjectId: v.subjectId,
      subjectName: subjectNameById.get(v.subjectId) ?? v.subjectId,
      chapterId,
      chapterName: chapterNameById.get(chapterId) ?? chapterId,
      totalAttempts: v.attempts,
      correctCount: v.correct,
      accuracyPercent,
      weaknessScore,
    })
  }

  out.sort((a, b) => {
    if (a.accuracyPercent !== b.accuracyPercent) return a.accuracyPercent - b.accuracyPercent
    return b.totalAttempts - a.totalAttempts
  })
  return out.slice(0, limit)
}

/** 목표 대학 문자열에 따른 데모 선배 지표(실데이터 연동 전) */
export function demoPeerAdmissionStats(targetUniversity: string): {
  totalEnteredTarget: number
  similarLevelEnteredTarget: number
} {
  let h = 0
  for (let i = 0; i < targetUniversity.length; i++) h = (h * 31 + targetUniversity.charCodeAt(i)) | 0
  const base = 1200 + (Math.abs(h) % 900)
  const similar = 48 + (Math.abs(h) % 85)
  return {
    totalEnteredTarget: base,
    similarLevelEnteredTarget: similar,
  }
}
