import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Container, Loader, Tabs, Text, Alert } from '@mantine/core'
import { getFasttrackUserId } from '../../lib/fasttrackUser'
import { fetchPassNavBundle } from '../../lib/passNavQueries'
import { messageFromUnknownError } from '../../lib/unknownError'
import {
  buildCategoryCompare,
  buildRadarRows,
  buildPassNavSubjectMetricRows,
  expectedPrepProgressPercent,
  avgUserLectureCompletion,
  isGpsPathDeviation,
  getDDay,
} from '../../lib/passNavModel'
import { buildDualRecommendationCards } from '../../lib/passNavRecommendations'
import { buildPassNavAlertHistory, buildPassNavAlerts } from '../../lib/passNavAlerts'
import { loadFocusSnapshot, saveFocusSnapshot } from '../../lib/passNavFocusStorage'
import type { PassNavBundle } from '../../types/passNav'
import { PassNavCommandCenter } from './pass-nav/PassNavCommandCenter'
import { PassNavDetailAnalysis } from './pass-nav/PassNavDetailAnalysis'
import { PassNavAlertCenter } from './pass-nav/PassNavAlertCenter'
import './pass-nav/pass-nav.css'

export function CurriculumCoachPage() {
  const userId = useMemo(() => getFasttrackUserId(), [])
  const loadedOnceRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [navBusy, setNavBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<PassNavBundle | null>(null)
  const [activeGoalPriority, setActiveGoalPriority] = useState(1)

  const load = useCallback(async () => {
    const first = !loadedOnceRef.current
    if (first) setLoading(true)
    else setNavBusy(true)
    setError(null)
    try {
      const b = await fetchPassNavBundle(userId, { activePriority: activeGoalPriority })
      setBundle(b)
    } catch (e) {
      setError(messageFromUnknownError(e))
      setBundle(null)
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
      void load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  const derived = useMemo(() => {
    if (!bundle) return null
    const dDay = getDDay()
    const expectedProgress = expectedPrepProgressPercent(dDay)
    const userProgress = avgUserLectureCompletion(bundle)
    const gpsDeviated = isGpsPathDeviation(bundle, dDay)
    const compares = buildCategoryCompare(bundle)
    const radar = buildRadarRows(bundle)
    const subjectMetricRows = buildPassNavSubjectMetricRows(bundle)
    const dual = buildDualRecommendationCards(bundle)
    const overallPct =
      radar.length > 0 ? radar.reduce((s, r) => s + r.user, 0) / radar.length : 0
    const prevFocus = loadFocusSnapshot()
    const alerts = buildPassNavAlerts(bundle, prevFocus)
    const alertHistory = buildPassNavAlertHistory(bundle, prevFocus)
    return {
      dDay,
      expectedProgress,
      userProgress,
      gpsDeviated,
      compares,
      radar,
      subjectMetricRows,
      dual,
      overallPct,
      alerts,
      alertHistory,
    }
  }, [bundle])

  useEffect(() => {
    if (!bundle) return
    const snap: Record<string, number> = {}
    for (const u of bundle.userLecture) {
      snap[u.lecture_id] = u.focus_score != null ? Number(u.focus_score) : 0
    }
    saveFocusSnapshot(snap)
  }, [bundle])

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Loader />
      </Container>
    )
  }

  if (error) {
    return (
      <Container size="xl" py="xl">
        <Alert color="red" title="불러오기 실패">
          {error}
        </Alert>
      </Container>
    )
  }

  if (!bundle || !derived) {
    return (
      <Container size="xl" py="xl">
        <Text>데이터가 없습니다.</Text>
      </Container>
    )
  }

  return (
    <Container size="xl" py="xl">
      <Tabs defaultValue="center">
        <Tabs.List>
          <Tabs.Tab value="center">관제 센터</Tabs.Tab>
          <Tabs.Tab value="detail">상세 분석</Tabs.Tab>
          <Tabs.Tab value="alerts">알림 센터</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="center" pt="lg">
          <PassNavCommandCenter
            bundle={bundle}
            activeGoalPriority={activeGoalPriority}
            onSelectGoalPriority={setActiveGoalPriority}
            busy={navBusy}
            alertHistory={derived.alertHistory}
            subjectMetricRows={derived.subjectMetricRows}
            dDay={derived.dDay}
            expectedProgress={derived.expectedProgress}
            userProgress={derived.userProgress}
            gpsDeviated={derived.gpsDeviated}
            dual={derived.dual}
            overallPct={derived.overallPct}
          />
        </Tabs.Panel>
        <Tabs.Panel value="detail" pt="lg">
          <PassNavDetailAnalysis bundle={bundle} />
        </Tabs.Panel>
        <Tabs.Panel value="alerts" pt="lg">
          <PassNavAlertCenter alerts={derived.alerts} />
        </Tabs.Panel>
      </Tabs>
    </Container>
  )
}
