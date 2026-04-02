import { useEffect, useState } from 'react'
import {
  Badge,
  Box,
  Group,
  LoadingOverlay,
  Paper,
  RingProgress,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { supabase } from '../../../lib/supabase'
import type { PassNavHistoryItem } from '../../../lib/passNavAlerts'
import type { PassNavBundle, PassNavSubjectMetricRow } from '../../../types/passNav'
import type { DualCards } from '../../../lib/passNavRecommendations'
import { GpsRoadmap } from './GpsRoadmap'
import { PassNavSubjectMetricsPanel } from './PassNavSubjectMetricsPanel'
import { DualRecommendationDeck } from './DualRecommendationDeck'

type Props = {
  bundle: PassNavBundle
  activeGoalPriority: number
  onSelectGoalPriority: (priority: number) => void
  busy?: boolean
  alertHistory: PassNavHistoryItem[]
  subjectMetricRows: PassNavSubjectMetricRow[]
  dDay: number
  expectedProgress: number
  userProgress: number | null
  gpsDeviated: boolean
  dual: DualCards
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
  expectedProgress,
  userProgress,
  gpsDeviated,
  dual,
  overallPct,
}: Props) {
  const g = bundle.primaryGoal
  const goalChoices = [...bundle.goals].sort((a, b) => a.priority - b.priority)

  const [exactBenchLookup, setExactBenchLookup] = useState<{
    status: 'idle' | 'loading' | 'ok' | 'err'
    id: string | null
    message: string | null
  }>({ status: 'idle', id: null, message: null })

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
          <Text c="dimmed" size="sm">
            합격 관제 센터 · 데이터는 거짓말하지 않습니다
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
        <Group align="center" gap="xl" wrap="wrap">
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
          <div>
            <Text fw={600}>종합 진행 (파생 지표 평균)</Text>
            <Text size="sm" c="dimmed">
              D-Day {dDay}일 · 수능 앵커 11/12
            </Text>
            {!bundle.benchmarkId ? (
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
            ) : null}
          </div>
        </Group>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <GpsRoadmap
          dDay={dDay}
          expectedProgress={expectedProgress}
          userProgress={userProgress}
          deviated={gpsDeviated}
        />
      </Paper>

      <Paper withBorder p="md" radius="md">
        <PassNavSubjectMetricsPanel
          rows={subjectMetricRows}
          hasBenchmark={Boolean(bundle.benchmarkId)}
          bundle={bundle}
          alertHistory={alertHistory}
        />
      </Paper>

      <DualRecommendationDeck cards={dual} />

      <Paper withBorder p="md" radius="md">
        <Text size="sm" fw={600} mb="xs">
          처방 큐 (questions_bank · 취약 category)
        </Text>
        {bundle.bankQuestionsForWeakTags.length === 0 ? (
          <Text size="sm" c="dimmed">
            추천 문항 없음 (마스터리/카테고리 데이터 확인)
          </Text>
        ) : (
          <Text size="sm" component="div">
            {bundle.bankQuestionsForWeakTags.slice(0, 5).map((q) => (
              <div key={q.question_id}>
                · {q.category_label ?? '—'} —{' '}
                <a href="/study/mock-exam/questions-bank">문제 은행에서 풀이</a>
              </div>
            ))}
          </Text>
        )}
      </Paper>
    </Stack>
    </Box>
  )
}
