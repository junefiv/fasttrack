const STORAGE_KEY = 'fasttrack-curriculum-watched-sessions-v1'

/** 인강 세션 시청 완료로 표시한 session id (로컬). 추후 서버 연동 시 대체 가능 */
export function loadWatchedSessionIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    return p.filter((x): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}

export function saveWatchedSessionIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]))
  } catch {
    /* ignore */
  }
}

/** 시청으로 표시한 세션 수 (분모는 전체 세션 수와 별도로 페이지에서 조합) */
export function countWatchedSessions(): number {
  return loadWatchedSessionIds().length
}
