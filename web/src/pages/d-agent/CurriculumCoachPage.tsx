import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Container, Loader, Text, Alert, Modal, Stack } from '@mantine/core'
import { getFasttrackUserId } from '../../lib/fasttrackUser'
import { fetchPassNavAlertsForUser, fetchPassNavBundle } from '../../lib/passNavQueries'
import { messageFromUnknownError } from '../../lib/unknownError'
import { buildPassNavSubjectMetricRows, getDDay, passNavSubjectBarOverallPct } from '../../lib/passNavModel'
import {
  buildPassNavAlertHistory,
  filterPassNavDbAlertsForActiveBenchmark,
  mapPassNavDbAlertsToHistoryItems,
} from '../../lib/passNavAlerts'
import { loadFocusSnapshot, saveFocusSnapshot } from '../../lib/passNavFocusStorage'
import type { PassNavBundle, PassNavDbAlertRow } from '../../types/passNav'
import { PassNavCommandCenter } from './pass-nav/PassNavCommandCenter'

export function CurriculumCoachPage() {
  const userId = useMemo(() => getFasttrackUserId(), [])
  const loadedOnceRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [navBusy, setNavBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<PassNavBundle | null>(null)
  const [dbAlerts, setDbAlerts] = useState<PassNavDbAlertRow[]>([])
  const [activeGoalPriority, setActiveGoalPriority] = useState(1)

  /** 탭 복귀 시에는 silent로 호출해 오버레이 없이 갱신(다른 창 갔다 오면 "다시 로드"처럼 보이지 않게) */
  const load = useCallback(async (options?: { silent?: boolean }) => {
    const first = !loadedOnceRef.current
    const silent = options?.silent === true
    if (first) setLoading(true)
    else if (!silent) setNavBusy(true)
    setError(null)
    try {
      const [bundleResult, alertsResult] = await Promise.allSettled([
        fetchPassNavBundle(userId, { activePriority: activeGoalPriority }),
        fetchPassNavAlertsForUser(userId),
      ])
      if (bundleResult.status === 'rejected') throw bundleResult.reason
      setBundle(bundleResult.value)
      setDbAlerts(alertsResult.status === 'fulfilled' ? alertsResult.value : [])
    } catch (e) {
      setError(messageFromUnknownError(e))
      setBundle(null)
      setDbAlerts([])
    } finally {
      setLoading(false)
      setNavBusy(false)
      loadedOnceRef.current = true
    }
  }, [userId, activeGoalPriority])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (!loadedOnceRef.current) return
      void load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  const derived = useMemo(() => {
    if (!bundle) return null
    const dDay = getDDay()
    const subjectMetricRows = buildPassNavSubjectMetricRows(bundle)
    const overallPct = passNavSubjectBarOverallPct(subjectMetricRows)
    const prevFocus = loadFocusSnapshot()
    const alertHistory =
      dbAlerts.length > 0
        ? mapPassNavDbAlertsToHistoryItems(
            bundle,
            filterPassNavDbAlertsForActiveBenchmark(dbAlerts, bundle),
          )
        : buildPassNavAlertHistory(bundle, prevFocus)
    return {
      dDay,
      subjectMetricRows,
      overallPct,
      alertHistory,
    }
  }, [bundle, dbAlerts])

  useEffect(() => {
    if (!bundle) return
    const snap: Record<string, number> = {}
    for (const u of bundle.userLecture) {
      snap[u.lecture_id] = u.focus_score != null ? Number(u.focus_score) : 0
    }
    saveFocusSnapshot(snap)
  }, [bundle])

  return (
    <>
      <Modal
        opened={loading}
        onClose={() => {}}
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        centered
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      >
        <Stack align="center" gap="md" py="sm">
          <Loader />
          <Text ta="center" size="sm">
            학생의 목표를 이룬 선배들의 학습 데이터를 가져오는 중입니다.
          </Text>
        </Stack>
      </Modal>

      {!loading && error ? (
        <Container size="xl" py="xl">
          <Alert color="red" title="불러오기 실패">
            {error}
          </Alert>
        </Container>
      ) : null}

      {!loading && !error && (!bundle || !derived) ? (
        <Container size="xl" py="xl">
          <Text>데이터가 없습니다.</Text>
        </Container>
      ) : null}

      {!loading && !error && bundle && derived ? (
        <Container size="xl" py="xl">
          <PassNavCommandCenter
            bundle={bundle}
            activeGoalPriority={activeGoalPriority}
            onSelectGoalPriority={setActiveGoalPriority}
            busy={navBusy}
            alertHistory={derived.alertHistory}
            subjectMetricRows={derived.subjectMetricRows}
            dDay={derived.dDay}
            overallPct={derived.overallPct}
          />
        </Container>
      ) : null}
    </>
  )
}
