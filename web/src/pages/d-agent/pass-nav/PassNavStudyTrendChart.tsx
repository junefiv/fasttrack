import { LineChart } from '@mantine/charts'
import { Group, SegmentedControl, Stack, Text, useMantineTheme } from '@mantine/core'
import { useMemo, useState } from 'react'
import {
  BENCHMARK_SERIES_NAME,
  PASS_NAV_STUDY_TREND_HARDCODED,
  PASS_NAV_STUDY_TREND_SUBJECTS,
  type PassNavStudyTrendMetricKey,
  type PassNavStudyTrendPeriodKey,
} from '../../../lib/passNavStudyTrendData'

function metricFormatter(metric: PassNavStudyTrendMetricKey): (v: number) => string {
  if (metric === 'study') return (v) => `${v}분`
  if (metric === 'problems') return (v) => `${v}문항`
  return (v) => `${v}초`
}

export function PassNavStudyTrendChart() {
  const theme = useMantineTheme()
  const [metric, setMetric] = useState<PassNavStudyTrendMetricKey>('study')
  const [period, setPeriod] = useState<PassNavStudyTrendPeriodKey>('daily')
  const [subject, setSubject] = useState<string>(() => PASS_NAV_STUDY_TREND_SUBJECTS[0].key)

  const { chartData, chartSeries, yUnit } = useMemo(() => {
    const block = PASS_NAV_STUDY_TREND_HARDCODED[period]
    const values = block.series[metric]
    const bench = block.benchmarkBySubject[metric][subject]
    /** 시리즈 name / data 행 키가 반드시 일치해야 선이 그려짐 */
    const benchSeriesKey = `${BENCHMARK_SERIES_NAME} (${subject})`
    const primaryShade = 6

    const data = block.labels.map((label, i) => {
      const row: Record<string, string | number> = { 기간: label }
      row[benchSeriesKey] = bench?.[i] ?? 0
      const arr = values[subject]
      row[subject] = arr?.[i] ?? 0
      return row
    })

    const benchmarkSeries = {
      name: benchSeriesKey,
      color: 'blue.6',
      strokeDasharray: '6 4',
    }
    const subjectSeries = {
      name: subject,
      color: `${theme.primaryColor}.${primaryShade}`,
    }
    const series = [benchmarkSeries, subjectSeries]

    const yUnit =
      metric === 'study' ? '분' : metric === 'problems' ? '문항' : '초'

    return { chartData: data, chartSeries: series, yUnit }
  }, [metric, period, subject, theme.primaryColor])

  const xAxisTickFormatter = (value: string) => {
    if (period === 'monthly') return value
    if (value === '1/1' || value === '2/1' || value === '3/1' || value === '3/31') return value
    return ''
  }

  return (
    <Stack gap="sm" style={{ flex: 1, minWidth: 280 }}>
      <Text fw={600} size="sm">
        과목별 평가
      </Text>

      <Group gap="xs" align="center" wrap="wrap">
        <Text size="xs" c="dimmed" w={56}>
          지표
        </Text>
        <SegmentedControl
          size="xs"
          value={metric}
          onChange={(v) => setMetric(v as PassNavStudyTrendMetricKey)}
          data={[
            { value: 'study', label: '수강시간' },
            { value: 'problems', label: '문제풀이수' },
            { value: 'avgSec', label: '평균 풀이시간' },
          ]}
        />
      </Group>

      <Group gap="xs" align="center" wrap="wrap">
        <Text size="xs" c="dimmed" w={56}>
          구간
        </Text>
        <SegmentedControl
          size="xs"
          value={period}
          onChange={(v) => setPeriod(v as PassNavStudyTrendPeriodKey)}
          data={[
            { value: 'daily', label: '일자별' },
            { value: 'monthly', label: '월별' },
          ]}
        />
      </Group>

      <Group gap="xs" align="center" wrap="wrap">
        <Text size="xs" c="dimmed" w={56}>
          과목
        </Text>
        <SegmentedControl
          size="xs"
          value={subject}
          onChange={setSubject}
          data={PASS_NAV_STUDY_TREND_SUBJECTS.map((s) => ({ value: s.key, label: s.key }))}
        />
      </Group>

      <LineChart
        h={240}
        data={chartData}
        dataKey="기간"
        series={chartSeries}
        curveType="monotone"
        withDots={period === 'monthly'}
        withLegend
        gridAxis="xy"
        xAxisProps={{ tickFormatter: xAxisTickFormatter }}
        yAxisLabel={yUnit}
        valueFormatter={metricFormatter(metric)}
      />
    </Stack>
  )
}
