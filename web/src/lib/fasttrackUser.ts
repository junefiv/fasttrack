const STORAGE_KEY = 'fasttrack_dev_user_id'

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** 프로토타입: .env 고정 UUID, 없으면 localStorage에 생성해 유지 */
export function getFasttrackUserId(): string {
  const fromEnv = import.meta.env.VITE_FASTTRACK_DEV_USER_ID?.trim()
  if (fromEnv) return fromEnv

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
    const created = randomUuid()
    localStorage.setItem(STORAGE_KEY, created)
    console.warn(
      '[FASTTRACK] VITE_FASTTRACK_DEV_USER_ID 가 없어 임시 사용자 UUID를 localStorage에 저장했습니다.',
    )
    return created
  } catch {
    console.warn('[FASTTRACK] localStorage 사용 불가 — 세션마다 새 UUID')
    return randomUuid()
  }
}
