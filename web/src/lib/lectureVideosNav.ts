/** 강좌(lectures.id) 기준 — 강의 목록에서 선생님 단계를 건너뛰고 해당 강좌 제목·회차 화면으로 */
export function lectureBrowseDeepLink(lectureId: string | null | undefined): string | null {
  const id = lectureId?.trim()
  if (!id) return null
  return `/study/videos?lecture=${encodeURIComponent(id)}`
}
