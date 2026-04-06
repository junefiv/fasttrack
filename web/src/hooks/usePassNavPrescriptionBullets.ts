import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { aggregateAlertBodiesForBenchmark } from '../lib/passNavAlerts'
import { generatePassNavPrescriptionBulletsWithGemini, parsePassNavPrescriptionBulletsJson } from '../lib/gemini'
import {
  logPassNavRxError,
  logPassNavRxGate,
  logPassNavRxGeminiResult,
  logPassNavRxPayload,
  type PassNavRxGateDebug,
} from '../lib/passNavPrescriptionDebug'
import { messageFromUnknownError } from '../lib/unknownError'
import type { PassNavBundle, PassNavDbAlertRow } from '../types/passNav'

/**
 * 처방 큐: `public.alerts` 중 `user_id` 조회 + 클라이언트에서 `benchmark_id === bundle.benchmarkId` 인 행의 `body`만 합친 문자열로
 * Gemini에 학생 상태 진단 → 처방(bullets) 요청. 다른 입력은 넣지 않음.
 */
export type PassNavPrescriptionInput = {
  bundle: PassNavBundle | null
  dbAlerts: PassNavDbAlertRow[]
}

type PrescriptionPayload = Record<string, unknown>

function buildPrescriptionPayload(input: PassNavPrescriptionInput): {
  willFetch: boolean
  payload: PrescriptionPayload | null
  debug: PassNavRxGateDebug
} {
  const { bundle, dbAlerts } = input
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? ''

  const bid = bundle?.benchmarkId ?? null
  const matchingCount =
    bundle && bid ? dbAlerts.filter((r) => r.benchmark_id === bid).length : 0

  const alertBodiesCorpus = bundle ? aggregateAlertBodiesForBenchmark(bundle, dbAlerts) : ''

  const hasPrescriptionInput = alertBodiesCorpus.trim().length > 0

  const emptyDebug = (partial: Partial<PassNavRxGateDebug>): PassNavRxGateDebug => ({
    bundlePresent: Boolean(bundle),
    benchmarkId: bid,
    apiKeyPresent: Boolean(apiKey),
    rawDbAlertsCount: dbAlerts.length,
    alertsMatchingBenchmarkCount: matchingCount,
    alertBodiesCorpusLen: alertBodiesCorpus.length,
    hasPrescriptionInput,
    skipReason: null,
    ...partial,
  })

  if (!bundle) {
    return {
      willFetch: false,
      payload: null,
      debug: emptyDebug({
        skipReason: 'bundle 없음 (목표·학습 번들 미로드)',
      }),
    }
  }

  if (!apiKey) {
    return {
      willFetch: false,
      payload: null,
      debug: emptyDebug({
        skipReason: 'VITE_GEMINI_API_KEY 없음 (AI 처방 비활성)',
      }),
    }
  }

  if (!hasPrescriptionInput) {
    return {
      willFetch: false,
      payload: null,
      debug: emptyDebug({
        skipReason:
          '현재 벤치(benchmark_id)와 일치하는 미해소 알림의 body 가 없음 — alerts.benchmark_id·목표 연결을 확인하세요',
      }),
    }
  }

  const payload: PrescriptionPayload = {
    alertBodiesCorpus,
  }

  return {
    willFetch: true,
    payload,
    debug: {
      bundlePresent: true,
      benchmarkId: bid,
      apiKeyPresent: true,
      rawDbAlertsCount: dbAlerts.length,
      alertsMatchingBenchmarkCount: matchingCount,
      alertBodiesCorpusLen: alertBodiesCorpus.length,
      hasPrescriptionInput: true,
      skipReason: null,
    },
  }
}

export function usePassNavPrescriptionBullets(input: PassNavPrescriptionInput) {
  const { bundle, dbAlerts } = input

  const [prescriptionLoading, setPrescriptionLoading] = useState(false)
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null)
  const [prescriptionBullets, setPrescriptionBullets] = useState<string[]>([])

  const { willFetch, payload, debug } = useMemo(
    () =>
      buildPrescriptionPayload({
        bundle,
        dbAlerts,
      }),
    [bundle, dbAlerts],
  )

  const lastGateLogKey = useRef<string>('')

  useEffect(() => {
    const key = JSON.stringify({
      willFetch,
      debug,
    })
    if (key === lastGateLogKey.current) return
    lastGateLogKey.current = key
    logPassNavRxGate(debug, willFetch)
  }, [willFetch, debug])

  useLayoutEffect(() => {
    if (!willFetch) {
      setPrescriptionLoading(false)
      return
    }
    setPrescriptionLoading(true)
  }, [willFetch])

  useEffect(() => {
    let cancelled = false

    if (!bundle) {
      setPrescriptionError(null)
      setPrescriptionBullets([])
      return
    }

    if (!willFetch || !payload) {
      setPrescriptionError(null)
      setPrescriptionBullets([])
      return
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? ''
    if (!apiKey) {
      setPrescriptionLoading(false)
      return
    }

    setPrescriptionError(null)
    logPassNavRxPayload(payload)

    void (async () => {
      try {
        const raw = await generatePassNavPrescriptionBulletsWithGemini({ apiKey, payload })
        if (cancelled) return
        const bullets = parsePassNavPrescriptionBulletsJson(raw)
        setPrescriptionBullets(bullets)
        logPassNavRxGeminiResult({
          rawLength: raw.length,
          rawPreview: raw.slice(0, 800),
          rawFull: raw,
          bulletsCount: bullets.length,
          bullets,
        })
      } catch (e) {
        if (cancelled) return
        logPassNavRxError(e)
        setPrescriptionError(messageFromUnknownError(e))
        setPrescriptionBullets([])
      } finally {
        if (!cancelled) setPrescriptionLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bundle, willFetch, payload])

  return { prescriptionLoading, prescriptionError, prescriptionBullets }
}
