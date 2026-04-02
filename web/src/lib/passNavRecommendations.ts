import type { PassNavBundle } from '../types/passNav'
import { avgBenchLectureCompletionForUser, avgUserLectureCompletion } from './passNavModel'

export type DualCards = { functional: string; prescriptive: string; functionalHref: string; prescriptiveHref: string }

export function buildDualRecommendationCards(bundle: PassNavBundle): DualCards {
  const lectureById = new Map(bundle.lectures.map((l) => [l.id, l]))
  const benchByLecture = new Map(bundle.benchLecture.map((b) => [b.lecture_id, b]))
  let worstId: string | null = null
  let worstGap = -1
  for (const u of bundle.userLecture) {
    const b = benchByLecture.get(u.lecture_id)
    if (!b) continue
    const uc = Number(u.completion_rate ?? 0)
    const bc = Number(b.completion_rate ?? 0)
    const gap = bc - uc
    if (gap > worstGap) {
      worstGap = gap
      worstId = u.lecture_id
    }
  }
  const title = worstId ? lectureById.get(worstId)?.title ?? '핵심 강의' : '추천 강의'
  const pct = Math.min(95, Math.round(70 + worstGap * 0.5))
  const functional =
    worstGap > 5
      ? `벤치마크 합격생의 ${pct}%가 완강한 「${title}」 강의가 아직 미수강·미완 상태입니다. 지금 바로 이어가세요.`
      : '강의 진도를 벤치마크 수준으로 맞추면 GPS 이탈 경보가 해소됩니다. 오늘 1강부터 시작해 보세요.'

  const uProg = avgUserLectureCompletion(bundle)
  const bProg = avgBenchLectureCompletionForUser(bundle)
  const maxStreak = Math.max(0, ...bundle.userLecture.map((x) => x.consecutive_learning_days ?? 0))
  const benchStreakAvg =
    bundle.benchLecture.length > 0
      ? bundle.benchLecture.reduce((s, b) => s + (b.consecutive_learning_days ?? 0), 0) /
        bundle.benchLecture.length
      : 7
  const streakGap = Math.max(0, Math.round(benchStreakAvg - maxStreak))
  const prescriptive =
    streakGap >= 2
      ? `현재 연속 학습일수가 벤치마크 대비 약 ${streakGap}일 뒤처졌습니다. 오늘 1강만 들어도 합격권 습관 점수 상위권으로 재진입할 수 있습니다.`
      : `평균 완강률은 ${uProg != null ? uProg.toFixed(0) : '—'}%이며, 합격권 평균은 ${bProg != null ? bProg.toFixed(0) : '—'}%입니다. 작은 목표 하나만 달성해 보세요.`

  return {
    functional,
    prescriptive,
    functionalHref: worstId ? '/study/videos' : '/study/videos',
    prescriptiveHref: '/study/videos',
  }
}
