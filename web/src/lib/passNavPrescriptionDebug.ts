/** 개발 서버 또는 `VITE_DEBUG_PASS_NAV_RX=true` 일 때만 처방 큐 디버그 로그 출력 */
export function passNavPrescriptionLogEnabled(): boolean {
  if (import.meta.env.DEV) return true
  return import.meta.env.VITE_DEBUG_PASS_NAV_RX === 'true'
}

export type PassNavRxGateDebug = {
  bundlePresent: boolean
  benchmarkId: string | null
  apiKeyPresent: boolean
  rawDbAlertsCount: number
  /** benchmark_id === bundle.benchmarkId 인 행 수 */
  alertsMatchingBenchmarkCount: number
  alertBodiesCorpusLen: number
  hasPrescriptionInput: boolean
  /** willFetch가 false일 때만 */
  skipReason: string | null
}

function summarizePayloadForLog(payload: Record<string, unknown>): Record<string, unknown> {
  const corpus = payload.alertBodiesCorpus
  return {
    alertBodiesCorpusLen: typeof corpus === 'string' ? corpus.length : 0,
    alertBodiesCorpusPreview: typeof corpus === 'string' ? corpus.slice(0, 400) : '',
  }
}

export function logPassNavRxGate(debug: PassNavRxGateDebug, willFetch: boolean): void {
  if (!passNavPrescriptionLogEnabled()) return
  /** 번들 로드 전 첫 렌더는 정상 — 게이트 로그 자체를 생략 */
  if (!debug.bundlePresent && !willFetch) return
  // eslint-disable-next-line no-console
  console.groupCollapsed('[PassNav Rx] 게이트 (처방 요청 여부)')
  // eslint-disable-next-line no-console
  console.log('willFetch', willFetch)
  // eslint-disable-next-line no-console
  console.table(debug)
  if (!willFetch && debug.skipReason) {
    // eslint-disable-next-line no-console
    console.warn('건너뜀 이유:', debug.skipReason)
  }
  // eslint-disable-next-line no-console
  console.groupEnd()
}

export function logPassNavRxPayload(payload: Record<string, unknown>): void {
  if (!passNavPrescriptionLogEnabled()) return
  // eslint-disable-next-line no-console
  console.groupCollapsed('[PassNav Rx] Gemini 입력 페이로드 요약')
  // eslint-disable-next-line no-console
  console.log(summarizePayloadForLog(payload))
  // eslint-disable-next-line no-console
  console.log('전체 JSON (길면 스크롤)', JSON.stringify(payload, null, 2))
  // eslint-disable-next-line no-console
  console.groupEnd()
}

export function logPassNavRxGeminiResult(params: {
  rawLength: number
  rawPreview: string
  rawFull: string
  bulletsCount: number
  bullets: string[]
}): void {
  if (!passNavPrescriptionLogEnabled()) return
  const { rawLength, rawPreview, rawFull, bulletsCount, bullets } = params
  // eslint-disable-next-line no-console
  console.groupCollapsed('[PassNav Rx] Gemini 응답 → 파싱 결과')
  // eslint-disable-next-line no-console
  console.log('raw 문자열 길이', rawLength)
  // eslint-disable-next-line no-console
  console.log('raw 앞부분(800자)', rawPreview)
  if (rawLength > 800) {
    // eslint-disable-next-line no-console
    console.log('raw 전체', rawFull)
  }
  // eslint-disable-next-line no-console
  console.log('파싱된 bullets 개수', bulletsCount)
  // eslint-disable-next-line no-console
  console.log('bullets', bullets)
  if (rawLength > 0 && bulletsCount === 0) {
    // eslint-disable-next-line no-console
    console.info(
      '[PassNav Rx] 파싱 후 bullets가 0입니다. 아래 raw 전체를 보고 JSON 키·배열 형태를 확인하세요. (parsePassNavPrescriptionBulletsJson 보강됨)',
    )
  }
  // eslint-disable-next-line no-console
  console.groupEnd()
}

export function logPassNavRxError(err: unknown): void {
  if (!passNavPrescriptionLogEnabled()) return
  // eslint-disable-next-line no-console
  console.error('[PassNav Rx] 요청 실패', err)
}
