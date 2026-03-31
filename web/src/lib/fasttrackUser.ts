/**
 * 프로토타입 공용 사용자(로그인 없음). 동일 앱 링크에 접속한 모두 동일 `user_id`로 Supabase에 기록됩니다.
 * 다른 ID를 쓰려면 `VITE_FASTTRACK_DEV_USER_ID`를 설정하세요.
 */
export const FASTTRACK_PROTOTYPE_SHARED_USER_ID = '11111111-1111-4111-8111-111111111111'

/** 프로토타입: `VITE_FASTTRACK_DEV_USER_ID`가 있으면 우선, 없으면 공용 UUID */
export function getFasttrackUserId(): string {
  const fromEnv = import.meta.env.VITE_FASTTRACK_DEV_USER_ID?.trim()
  if (fromEnv) return fromEnv
  return FASTTRACK_PROTOTYPE_SHARED_USER_ID
}
