import { supabase } from './supabase'
import type { FasttrackDrillProblemRow, FasttrackProblemRow } from '../types/fasttrack'

export type AnswerForStats = {
  problem: FasttrackProblemRow | FasttrackDrillProblemRow
  is_correct: boolean
}

/** 응시 직후 챕터별로 시도·정답을 누적해 fasttrack_student_stats 갱신 */
export async function upsertStudentStatsAfterSession(
  userId: string,
  answers: AnswerForStats[],
): Promise<void> {
  const analysis_date = new Date().toISOString().slice(0, 10)
  const byChapter = new Map<
    string,
    { subject_id: string; chapter_id: string; total: number; correct: number; problem_type: 'multiple' | 'subjective' }
  >()

  for (const { problem, is_correct } of answers) {
    const key = `${problem.subject_id}:${problem.chapter_id}`
    const cur = byChapter.get(key) ?? {
      subject_id: problem.subject_id,
      chapter_id: problem.chapter_id,
      total: 0,
      correct: 0,
      problem_type: problem.problem_type,
    }
    cur.total += 1
    if (is_correct) cur.correct += 1
    byChapter.set(key, cur)
  }

  for (const agg of byChapter.values()) {
    const { data: existing } = await supabase
      .from('fasttrack_student_stats')
      .select('id,total_attempts,correct_count')
      .eq('user_id', userId)
      .eq('subject_id', agg.subject_id)
      .eq('chapter_id', agg.chapter_id)
      .eq('analysis_date', analysis_date)
      .maybeSingle()

    const total_attempts = (existing?.total_attempts ?? 0) + agg.total
    const correct_count = (existing?.correct_count ?? 0) + agg.correct
    const accuracy_rate =
      total_attempts > 0 ? Math.round((correct_count * 10000) / total_attempts) / 100 : 0
    const weakness_score = Math.min(100, Math.max(0, Math.round((100 - accuracy_rate) * 100) / 100))

    const base = {
      user_id: userId,
      subject_id: agg.subject_id,
      chapter_id: agg.chapter_id,
      section_id: null as string | null,
      problem_type: agg.problem_type,
      analysis_date,
      total_attempts,
      correct_count,
      accuracy_rate,
      weakness_score,
    }

    if (existing?.id) {
      const { error } = await supabase.from('fasttrack_student_stats').update(base).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('fasttrack_student_stats').insert({
        ...base,
        id: crypto.randomUUID(),
      })
      if (error) throw error
    }
  }
}
