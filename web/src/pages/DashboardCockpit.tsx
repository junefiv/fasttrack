import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  RingProgress,
  ScrollArea,
  SegmentedControl,
  Text,
} from '@mantine/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PassNavDataLoadingModal } from '../components/PassNavDataLoadingModal'
import { usePassNavPrescriptionBullets } from '../hooks/usePassNavPrescriptionBullets'
import { getFasttrackUserId } from '../lib/fasttrackUser'
import {
  aggregateAlertBodiesForBenchmark,
  buildPassNavAlertHistory,
  filterPassNavDbAlertsForActiveBenchmark,
  mapPassNavDbAlertsToHistoryItems,
} from '../lib/passNavAlerts'
import {
  buildPassNavSubjectMetricRows,
  getDDay,
  passNavSubjectBarOverallPct,
} from '../lib/passNavModel'
import { fetchPassNavAlertsForUser, fetchPassNavBundle } from '../lib/passNavQueries'
import { loadFocusSnapshot, saveFocusSnapshot } from '../lib/passNavFocusStorage'
import { messageFromUnknownError } from '../lib/unknownError'
import type { PassNavBundle, PassNavDbAlertRow } from '../types/passNav'
import type { PassNavHistoryItem } from '../lib/passNavAlerts'
import './DashboardCockpit.css'

function toneClass(tone: PassNavHistoryItem['tone']): string {
  if (tone === 'danger') return 'cockpit-alert-row--danger'
  if (tone === 'success') return 'cockpit-alert-row--ok'
  return 'cockpit-alert-row--warn'
}

/** 네비게이터 `MasteryTrafficSection` 과 동일: 관련 강의·교재·문항 버튼 */
function AlertRemedyButtons({ remedy }: { remedy: PassNavHistoryItem['remedy'] }) {
  const videoTo = remedy?.videoHref
  const ebookTo = remedy?.ebookHref
  const drillTo = remedy?.drillHref
  if (!videoTo && !ebookTo && !drillTo) return null
  return (
    <Group gap="xs" wrap="wrap" mt={0} className="cockpit-alert-row__remedy-group">
      {videoTo ? (
        <Button size="compact-xs" variant="light" color="cyan" component={Link} to={videoTo}>
          관련 강의
        </Button>
      ) : null}
      {ebookTo ? (
        <Button size="compact-xs" variant="light" color="grape" component={Link} to={ebookTo}>
          관련 교재
        </Button>
      ) : null}
      {drillTo ? (
        <Button size="compact-xs" variant="light" color="orange" component={Link} to={drillTo}>
          관련 문항
        </Button>
      ) : null}
    </Group>
  )
}

export function DashboardCockpit() {
  const userId = useMemo(() => getFasttrackUserId(), [])
  const loadedOnceRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<PassNavBundle | null>(null)
  const [dbAlerts, setDbAlerts] = useState<PassNavDbAlertRow[]>([])
  const [activeGoalPriority, setActiveGoalPriority] = useState(1)

  const load = useCallback(async () => {
    const first = !loadedOnceRef.current
    if (first) setLoading(true)
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

  const g = bundle?.primaryGoal
  const goalChoices = bundle ? [...bundle.goals].sort((a, b) => a.priority - b.priority) : []

  const goalLabel = g
    ? `${activeGoalPriority}지망 ${g.university_name} ${g.department_name}`
    : '목표 미설정'

  const { prescriptionLoading, prescriptionError, prescriptionBullets } = usePassNavPrescriptionBullets({
    bundle,
    dbAlerts,
  })

  const rxBenchAlertCorpusLen = useMemo(() => {
    if (!bundle) return 0
    return aggregateAlertBodiesForBenchmark(bundle, dbAlerts).trim().length
  }, [bundle, dbAlerts])

  const blockingModalOpen =
    loading || (Boolean(bundle) && Boolean(derived) && prescriptionLoading)

  const dangerCount = derived ? derived.alertHistory.filter((i) => i.tone === 'danger').length : 0

  return (
    <div className="cockpit cockpit-dashboard">
      <PassNavDataLoadingModal opened={blockingModalOpen} />

      {!loading && error ? (
        <Alert color="red" title="대시보드를 불러오지 못했습니다" mb="lg">
          {error}
        </Alert>
      ) : null}

      {!loading && !error && (!bundle || !derived) ? (
        <div className="cockpit-dashboard__empty">
          <Text size="lg" fw={600}>
            연결할 데이터가 없습니다
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            목표·학습 기록이 연결되면 이곳에 이탈 경보와 처방이 표시됩니다.
          </Text>
          <Button component={Link} to="/d-agent/learning-coach" variant="light" color="teal">
            합격 네비게이터 열기
          </Button>
        </div>
      ) : null}

      {!loading && !error && bundle && derived ? (
        <>
          <header className="cockpit-dashboard__header">
            <div>
              <p className="cockpit__section-label">HOME</p>
              <h1 className="cockpit__title">HOME</h1>
              <p className="cockpit__subtitle">
                {goalLabel} · D-{derived.dDay} · 합격 경로 이탈 신호와 처방을 한곳에서 확인합니다.
              </p>
            </div>
            <Group gap="sm" wrap="wrap" justify="flex-end">
              {goalChoices.length > 1 ? (
                <SegmentedControl
                  size="xs"
                  value={String(activeGoalPriority)}
                  onChange={(v) => setActiveGoalPriority(Number(v))}
                  data={goalChoices.map((x) => ({
                    value: String(x.priority),
                    label: `${x.priority}지망`,
                  }))}
                />
              ) : null}
              <Badge size="lg" variant="light" color="teal" className="cockpit-dashboard__goal-badge">
                종합 {derived.overallPct.toFixed(0)}%
              </Badge>
              <Link to="/d-agent/learning-coach" className="cockpit-dashboard__nav-link">
                전체 네비게이터 →
              </Link>
            </Group>
          </header>

          <section className="cockpit-dashboard__hero" aria-label="요약">
            <div className="cockpit-dashboard__hero-ring">
              <RingProgress
                size={88}
                thickness={10}
                sections={[{ value: Math.min(100, derived.overallPct), color: 'teal' }]}
                label={
                  <Text ta="center" size="xs" fw={700}>
                    {derived.overallPct.toFixed(0)}%
                  </Text>
                }
              />
            </div>
            <div className="cockpit-dashboard__hero-copy">
              <p className="cockpit-dashboard__hero-kicker">오늘의 합격 거리</p>
              <p className="cockpit-dashboard__hero-stat">
                {g ? (
                  <>
                    <strong>{g.university_name}</strong> {g.department_name} 기준 종합 진척도입니다. 경보는
                    아래 타임라인에서, 실행 과제는 오른쪽 처방 큐에서 확인하세요.
                  </>
                ) : (
                  '목표 대학을 설정하면 벤치마크 대비 진척도가 여기에 반영됩니다.'
                )}
              </p>
            </div>
          </section>

          <div className="cockpit-dashboard__grid">
            <section className="cockpit-dashboard__panel cockpit-dashboard__panel--alerts" aria-labelledby="dash-alerts-title">
              <div className="cockpit-dashboard__panel-head">
                <h2 id="dash-alerts-title" className="cockpit-dashboard__panel-title">
                  이탈 경보 히스토리
                </h2>
                <div className="cockpit-dashboard__panel-meta">
                  {derived.alertHistory.length > 0 ? (
                    <>
                      <span className="cockpit-dashboard__chip">{derived.alertHistory.length}건</span>
                      {dangerCount > 0 ? (
                        <span className="cockpit-dashboard__chip cockpit-dashboard__chip--danger">
                          고위험 {dangerCount}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="cockpit-dashboard__chip cockpit-dashboard__chip--muted">경보 없음</span>
                  )}
                </div>
              </div>

              <ScrollArea.Autosize mah={520} type="auto" offsetScrollbars>
                <div className="cockpit-dashboard__timeline">
                  {derived.alertHistory.length === 0 ? (
                    <p className="cockpit-dashboard__empty-inline">
                      활성 이탈 경보가 없습니다. 학습 패턴이 쌓이면 이곳에 시간순으로 표시됩니다.
                    </p>
                  ) : (
                    derived.alertHistory.map((alert) => (
                      <article key={alert.id} className={`cockpit-alert-row ${toneClass(alert.tone)}`}>
                        <div className="cockpit-alert-row__rail" aria-hidden />
                        <div className="cockpit-alert-row__body">
                          <div className="cockpit-alert-row__top">
                            <span className="cockpit-alert-row__pillar">{alert.pillarLabel}</span>
                            <time className="cockpit-alert-row__time" dateTime={alert.occurredAt ?? undefined}>
                              {alert.displayTime}
                            </time>
                          </div>
                          <h3 className="cockpit-alert-row__title">{alert.title}</h3>
                          <div className="cockpit-alert-row__main">
                            <p className="cockpit-alert-row__text">{alert.body}</p>
                            <AlertRemedyButtons remedy={alert.remedy} />
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </ScrollArea.Autosize>
            </section>

            <section className="cockpit-dashboard__panel cockpit-dashboard__panel--rx" aria-labelledby="dash-rx-title">
              <div className="cockpit-dashboard__panel-head">
                <h2 id="dash-rx-title" className="cockpit-dashboard__panel-title">
                  처방 큐
                </h2>
                <Text size="xs" c="dimmed">
                  선택 벤치와 일치하는 미해소 알림 본문으로 진단·처방합니다.
                </Text>
              </div>

              {!import.meta.env.VITE_GEMINI_API_KEY?.trim() ? (
                <Alert color="yellow" variant="light" title="AI 처방 비활성">
                  VITE_GEMINI_API_KEY 가 없으면 처방 생성을 건너뜁니다. web/.env.local 을 확인하세요.
                </Alert>
              ) : null}

              {prescriptionLoading ? (
                <div className="cockpit-dashboard__rx-loading">
                  <Loader size="sm" color="teal" />
                  <Text size="sm" c="dimmed">
                    처방을 생성하는 중입니다…
                  </Text>
                </div>
              ) : null}

              {prescriptionError ? (
                <Alert color="red" title="처방 생성 오류">
                  {prescriptionError}
                </Alert>
              ) : null}

              {!prescriptionLoading && prescriptionBullets.length > 0 ? (
                <ol className="cockpit-rx-list">
                  {prescriptionBullets.map((line, i) => (
                    <li key={`${i}-${line.slice(0, 32)}`} className="cockpit-rx-list__item">
                      <span className="cockpit-rx-list__idx" aria-hidden>
                        {i + 1}
                      </span>
                      <span className="cockpit-rx-list__text">{line}</span>
                    </li>
                  ))}
                </ol>
              ) : null}

              {!prescriptionLoading &&
              !prescriptionError &&
              prescriptionBullets.length === 0 &&
              import.meta.env.VITE_GEMINI_API_KEY?.trim() ? (
                <p className="cockpit-dashboard__empty-inline">
                  {!bundle.benchmarkId
                    ? '목표에 연결된 벤치마크가 없어 알림을 벤치별로 묶을 수 없습니다.'
                    : rxBenchAlertCorpusLen === 0
                      ? '이 벤치에 해당하는 미해소 알림이 없습니다.'
                      : 'AI 응답이 비었습니다. 잠시 후 다시 시도해 주세요.'}
                </p>
              ) : null}
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}
