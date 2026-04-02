import { Grid, Stack, Tabs, Text } from '@mantine/core'
import { useState } from 'react'
import type { PassNavHistoryItem } from '../../../lib/passNavAlerts'
import type { PassNavBundle, PassNavSubjectMetricRow } from '../../../types/passNav'
import { MasteryTrafficSection } from './MasteryTrafficSection'
import { SolveSpeedBarSection } from './SolveSpeedBarSection'
import { StreakGrassHeatmap } from './StreakGrassHeatmap'

export function PassNavSubjectMetricsPanel({
  rows,
  hasBenchmark,
  bundle,
  alertHistory,
}: {
  rows: PassNavSubjectMetricRow[]
  hasBenchmark: boolean
  bundle: PassNavBundle
  alertHistory: PassNavHistoryItem[]
}) {
  const [tab, setTab] = useState<string>('__avg')
  const sorted = [...rows].sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ko'))

  return (
    <Stack gap="md">
      <Tabs value={tab} onChange={(v) => setTab(v ?? '__avg')}>
        <Tabs.List>
          <Tabs.Tab value="__avg">AVG</Tabs.Tab>
          {sorted.map((r) => (
            <Tabs.Tab key={r.subjectId} value={r.subjectId}>
              {r.subjectName}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      <Grid gutter="md" align="stretch">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <SolveSpeedBarSection
            selectedSubjectTab={tab}
            rows={rows}
            hasBenchmark={hasBenchmark}
            bundle={bundle}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <MasteryTrafficSection items={alertHistory} />
        </Grid.Col>
      </Grid>

      {tab === '__avg' ? (
        <Text size="sm" c="dimmed">
          연속 학습 잔디는 과목 탭을 선택하면 아래에 표시됩니다. AVG는 전 과목 지표의 산술평균이라 강의 단위 잔디와는 별도입니다.
        </Text>
      ) : null}

      {tab !== '__avg' ? (
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            연속 학습 잔디 · {sorted.find((r) => r.subjectId === tab)?.subjectName ?? tab}
          </Text>
          <StreakGrassHeatmap bundle={bundle} subjectId={tab} />
        </Stack>
      ) : null}
    </Stack>
  )
}
