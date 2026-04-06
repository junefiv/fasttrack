import { useEffect, useState } from 'react'
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  List,
  Loader,
  LoadingOverlay,
  Modal,
  Paper,
  RingProgress,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { supabase } from '../../../lib/supabase'
import {
  generatePassNavNavigatorSummaryWithGemini,
  generatePassNavPrescriptionBulletsWithGemini,
  parsePassNavPrescriptionBulletsJson,
} from '../../../lib/gemini'
import { buildPassNavBenchmarkLectureGaps } from '../../../lib/passNavModel'
import { messageFromUnknownError } from '../../../lib/unknownError'
import type { PassNavHistoryItem } from '../../../lib/passNavAlerts'
import type { PassNavBundle, PassNavSubjectMetricRow } from '../../../types/passNav'
import {
  buildPassNavNavigatorGeminiPayload,
  buildPassNavNavigatorReportPlainText,
  parsePassNavNavigatorGeminiJson,
  passNavigatorAiSectionsFromSummary,
  type PassNavNavigatorReportSection,
} from '../../../lib/passNavNavigatorReport'
import { PassNavStudyTrendChart } from './PassNavStudyTrendChart'
import { PassNavSubjectMetricsPanel } from './PassNavSubjectMetricsPanel'

type Props = {
  bundle: PassNavBundle
  activeGoalPriority: number
  onSelectGoalPriority: (priority: number) => void
  busy?: boolean
  alertHistory: PassNavHistoryItem[]
  subjectMetricRows: PassNavSubjectMetricRow[]
  dDay: number
  overallPct: number
}

export function PassNavCommandCenter({
  bundle,
  activeGoalPriority,
  onSelectGoalPriority,
  busy = false,
  alertHistory,
  subjectMetricRows,
  dDay,
  overallPct,
}: Props) {
  const g = bundle.primaryGoal
  const goalChoices = [...bundle.goals].sort((a, b) => a.priority - b.priority)

  const [exactBenchLookup, setExactBenchLookup] = useState<{
    status: 'idle' | 'loading' | 'ok' | 'err'
    id: string | null
    message: string | null
  }>({ status: 'idle', id: null, message: null })
  const [reportOpen, setReportOpen] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportAiSections, setReportAiSections] = useState<PassNavNavigatorReportSection[] | null>(null)
  const [prescriptionLoading, setPrescriptionLoading] = useState(false)
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null)
  const [prescriptionBullets, setPrescriptionBullets] = useState<string[]>([])

  const goalLabel = g
    ? `${activeGoalPriority}지망 ${g.university_name} ${g.department_name}`
    : '목표 미설정'

  const startNavigatorReport = () => {
    setReportOpen(true)
    setReportError(null)
    setReportAiSections(null)
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? ''
    if (!apiKey) {
      setReportError('VITE_GEMINI_API_KEY 가 .env 에 없습니다. web/.env.local 을 확인하고 개발 서버를 다시 시작하세요.')
      return
    }
    setReportLoading(true)
    void (async () => {
      try {
        const payload = buildPassNavNavigatorGeminiPayload({
          bundle,
          subjectMetricRows,
          alertHistory,
          overallPct,
          dDay,
          goalLabel,
          hasBenchmark: Boolean(bundle.benchmarkId),
        })
        const raw = await generatePassNavNavigatorSummaryWithGemini({ apiKey, payload })
        const summary = parsePassNavNavigatorGeminiJson(raw)
        setReportAiSections(passNavigatorAiSectionsFromSummary(summary))
      } catch (e) {
        setReportError(messageFromUnknownError(e))
      } finally {
        setReportLoading(false)
      }
    })()
  }

  const closeReport = () => {
    setReportOpen(false)
    setReportError(null)
    setReportAiSections(null)
    setReportLoading(false)
  }

  const sectionsForCopy = reportAiSections ?? []

  useEffect(() => {
    if (bundle.benchmarkId || !g) {
      setExactBenchLookup({ status: 'idle', id: null, message: null })
      return
    }
    let cancelled = false
    setExactBenchLookup({ status: 'loading', id: null, message: null })
    void (async () => {
      const res = await supabase
        .from('university_benchmarks')
        .select('id')
        .eq('university_name', g.university_name)
        .eq('department_name', g.department_name)
        .maybeSingle()
      if (cancelled) return
      if (res.error) {
        setExactBenchLookup({ status: 'err', id: null, message: res.error.message })
        return
      }
      const id = res.data?.id ?? null
      setExactBenchLookup({
        status: 'ok',
        id,
        message: null,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [bundle.benchmarkId, g?.university_name, g?.department_name])

  useEffect(() => {
    let cancelled = false
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? ''
    const bodies = alertHistory.map((h) => h.body).filter((b) => b.trim().length > 0)
    const gaps = buildPassNavBenchmarkLectureGaps(bundle)

    if (!apiKey) {
      setPrescriptionLoading(false)
      setPrescriptionError(null)
      setPrescriptionBullets([])
      return
    }
    if (bodies.length === 0 && gaps.length === 0) {
      setPrescriptionLoading(false)
      setPrescriptionError(null)
      setPrescriptionBullets([])
      return
    }

    setPrescriptionLoading(true)
    setPrescriptionError(null)
    void (async () => {
      try {
        const payload = {
          goalLabel,
          alertBodies: bodies.slice(0, 40),
          lectureGapsBehindBenchmark: gaps.slice(0, 20).map((x) => ({
            lectureTitle: x.lectureTitle,
            subject: x.subjectLabel,
            benchmarkCohortCompletionPct: x.benchCompletionPct,
            myCompletionPct: x.userCompletionPct,
          })),
        }
        const raw = await generatePassNavPrescriptionBulletsWithGemini({ apiKey, payload })
        if (cancelled) return
        setPrescriptionBullets(parsePassNavPrescriptionBulletsJson(raw))
      } catch (e) {
        if (cancelled) return
        setPrescriptionError(messageFromUnknownError(e))
        setPrescriptionBullets([])
      } finally {
        if (!cancelled) setPrescriptionLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [bundle, alertHistory, goalLabel])

  return (
    <Box pos="relative" mih={200}>
      <LoadingOverlay
        visible={busy}
        zIndex={50}
        overlayProps={{ blur: 2 }}
        loaderProps={{ type: 'bars' }}
      />
      <Stack gap="xl">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Title order={2}>FastTrack Pass-Nav 2.0</Title>
          <Text size="sm" c="dimmed" ta="left">
              D-Day {dDay}일 · 데이터는 거짓말하지 않습니다
            </Text>
          
        </div>
        <Stack gap="sm" align="flex-end" miw={{ base: '100%', sm: 280 }}>
          {goalChoices.length > 1 ? (
            <SegmentedControl
              size="sm"
              fullWidth
              value={String(activeGoalPriority)}
              onChange={(v) => onSelectGoalPriority(Number(v))}
              data={goalChoices.map((x) => ({
                value: String(x.priority),
                label: `${x.priority}지망`,
              }))}
            />
          ) : null}
          {g ? (
            <Badge size="lg" variant="light" color="teal">
              {activeGoalPriority}지망 {g.university_name} {g.department_name}
            </Badge>
          ) : (
            <Badge color="gray">목표 대학 미설정 · Supabase user_target_goals (현재 user_id)</Badge>
          )}
        </Stack>
      </Group>

      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <Group align="flex-start" gap="xl" wrap="wrap">
            <Stack gap="xs" align="center">
              <Text fw={600}>종합 평가</Text>

              <RingProgress
                size={120}
                thickness={12}
                sections={[{ value: overallPct, color: 'teal' }]}
                label={
                  <Text ta="center" size="sm" fw={700}>
                    {overallPct.toFixed(0)}%
                  </Text>
                }
              />
            </Stack>
            <PassNavStudyTrendChart />
            {!bundle.benchmarkId ? (
              <div>
                <Stack gap={4} mt={4}>
                  <Text size="sm" c="yellow">
                    벤치마크 행이 목표와 매칭되지 않았습니다. university_benchmarks 대학·학과명을 확인하세요.
                  </Text>
                  {g ? (
                    exactBenchLookup.status === 'loading' ? (
                      <Text size="xs" c="dimmed">
                        선택 지망 기준 university_benchmarks 동일명(문자열 완전 일치) 조회 중…
                      </Text>
                    ) : exactBenchLookup.status === 'err' ? (
                      <Text size="xs" c="red">
                        조회 오류: {exactBenchLookup.message}
                      </Text>
                    ) : exactBenchLookup.status === 'ok' && exactBenchLookup.id ? (
                      <Text size="xs" c="cyan" style={{ wordBreak: 'break-all' }}>
                        DB 동일 university_name·department_name 행 id: {exactBenchLookup.id}
                      </Text>
                    ) : exactBenchLookup.status === 'ok' ? (
                      <Text size="xs" c="dimmed">
                        university_benchmarks에 해당 문자열과 완전 일치하는 행 없음 · 목표 「{g.university_name}」 / 「
                        {g.department_name}」
                      </Text>
                    ) : null
                  ) : null}
                </Stack>
              </div>
            ) : null}
          </Group>
          <Button variant="light" color="teal" onClick={startNavigatorReport}>
            네비게이터 리포트 생성
          </Button>
        </Stack>
      </Paper>

      <Modal
        opened={reportOpen}
        onClose={closeReport}
        title="Pass-Nav 네비게이터 리포트"
        size="xl"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <Group justify="flex-end" mb="sm">
          <Button
            size="xs"
            variant="default"
            disabled={!reportAiSections?.length}
            onClick={() => {
              if (!reportAiSections?.length) return
              void navigator.clipboard.writeText(buildPassNavNavigatorReportPlainText(sectionsForCopy))
            }}
          >
            요약 복사
          </Button>
        </Group>
        <Stack gap="md" pr="sm">
          {reportError ? (
            <Alert color="red" title="리포트 생성 오류">
              {reportError}
            </Alert>
          ) : null}
          {reportLoading ? (
            <Text size="sm" c="dimmed">
              레포트를 생성하기 위해 학습데이터들을 수집중입니다.
            </Text>
          ) : null}
          {reportAiSections?.length ? (
            <Stack gap="lg">
              {reportAiSections.map((s) => (
                <div key={s.id}>
                  <Text fw={700} size="sm" mb={6}>
                    {s.title}
                  </Text>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {s.body}
                  </Text>
                </div>
              ))}
            </Stack>
          ) : !reportLoading && !reportError ? (
            <Text size="sm" c="dimmed">
              요약이 아직 없습니다. 잠시 후 다시 시도하세요.
            </Text>
          ) : null}
        </Stack>
      </Modal>

      <Paper withBorder p="md" radius="md">
        <PassNavSubjectMetricsPanel
          rows={subjectMetricRows}
          hasBenchmark={Boolean(bundle.benchmarkId)}
          bundle={bundle}
          alertHistory={alertHistory}
        />
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <div>
            <Text size="sm" fw={600}>
              처방 큐
            </Text>
            
          </div>
          {!import.meta.env.VITE_GEMINI_API_KEY?.trim() ? (
            <Text size="sm" c="dimmed">
              VITE_GEMINI_API_KEY 가 없어 AI 처방을 건너뜁니다. web/.env.local 에 키를 넣고 개발 서버를 다시 시작하세요.
            </Text>
          ) : null}
          {prescriptionLoading ? (
            <Group gap="xs">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                처방 생성 중…
              </Text>
            </Group>
          ) : null}
          {prescriptionError ? (
            <Alert color="red" title="처방 생성 오류">
              {prescriptionError}
            </Alert>
          ) : null}
          {prescriptionBullets.length > 0 ? (
            <List size="sm" spacing="xs" icon="•">
              {prescriptionBullets.map((line, i) => (
                <List.Item key={`${i}-${line.slice(0, 24)}`}>{line}</List.Item>
              ))}
            </List>
          ) : null}
          {!prescriptionLoading &&
          !prescriptionError &&
          prescriptionBullets.length === 0 &&
          import.meta.env.VITE_GEMINI_API_KEY?.trim() ? (
            <Text size="sm" c="dimmed">
              이탈 경보 본문·강좌 격차 데이터가 없거나 응답이 비었습니다.
            </Text>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
    </Box>
  )
}
