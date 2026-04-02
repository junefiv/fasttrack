const KEY = 'fasttrack-passnav-focus-v1'

export type FocusSnapshot = Record<string, number>

export function loadFocusSnapshot(): FocusSnapshot {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    if (typeof p !== 'object' || p === null) return {}
    const o = p as Record<string, unknown>
    const out: FocusSnapshot = {}
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function saveFocusSnapshot(next: FocusSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}
