const STORAGE_KEY = 'fasttrack-curriculum-coach-profile-v1'

export type CurriculumCoachProfile = {
  /** 현재 목표 대학 */
  targetUniversity: string
  /** 직전에 목표로 삼았던 대학(경로 비교·선배 풀 기준) */
  previousTargetUniversity: string
}

const DEFAULTS: CurriculumCoachProfile = {
  targetUniversity: '서울대학교',
  previousTargetUniversity: '연세대학교',
}

export function loadCurriculumCoachProfile(): CurriculumCoachProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as unknown
    if (typeof p !== 'object' || p === null) return { ...DEFAULTS }
    const o = p as Record<string, unknown>
    const targetUniversity =
      typeof o.targetUniversity === 'string' && o.targetUniversity.trim()
        ? o.targetUniversity.trim()
        : DEFAULTS.targetUniversity
    const previousTargetUniversity =
      typeof o.previousTargetUniversity === 'string' && o.previousTargetUniversity.trim()
        ? o.previousTargetUniversity.trim()
        : DEFAULTS.previousTargetUniversity
    return { targetUniversity, previousTargetUniversity }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveCurriculumCoachProfile(profile: CurriculumCoachProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    /* ignore */
  }
}
