/**
 * Supabase PostgrestError 등 Error 인스턴스가 아닌 throw 값에서 사람이 읽을 문자열을 뽑습니다.
 */
export function messageFromUnknownError(e: unknown): string {
  if (e == null) return '알 수 없는 오류가 발생했습니다.'
  if (e instanceof Error) return e.message || e.name || 'Error'
  if (typeof e === 'string') return e
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>
    const parts: string[] = []
    if (typeof o.message === 'string' && o.message) parts.push(o.message)
    if (typeof o.code === 'string' && o.code) parts.push(`코드: ${o.code}`)
    if (typeof o.details === 'string' && o.details) parts.push(o.details)
    if (typeof o.hint === 'string' && o.hint) parts.push(`힌트: ${o.hint}`)
    if (parts.length) return parts.join(' · ')
    try {
      return JSON.stringify(o)
    } catch {
      return '알 수 없는 오류'
    }
  }
  return String(e)
}

/** PostgREST: 테이블·뷰가 스키마 캐시에 없음(미생성·다른 프로젝트 스키마 등) */
export function isSupabaseMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const o = error as { code?: string; message?: string }
  if (o.code === 'PGRST205') return true
  if (typeof o.message === 'string' && o.message.includes('Could not find the table')) return true
  return false
}
