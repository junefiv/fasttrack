import { LineChart } from '@mantine/charts'
import { Group, SegmentedControl, Stack, Text } from '@mantine/core'
import { useMemo, useState } from 'react'

type MetricKey = 'study' | 'problems' | 'avgSec'
type PeriodKey = 'daily' | 'monthly'

/** 차트 시리즈 키 — 선택 과목 선과 구분 */
const BENCHMARK_SERIES_NAME = '벤치마크 평균'

const SUBJECTS = [
  { key: '수학', color: 'teal.6' },
  { key: '역사', color: 'violet.6' },
  { key: '국어', color: 'blue.6' },
  { key: '영어', color: 'orange.6' },
] as const

/** 일자별·월별 라벨 길이에 맞춘 하드코딩: 나(과목별) + 벤치마크 코호트 평균 */
const HARDCODED: Record<
  PeriodKey,
  {
    labels: string[]
    /** 지표별 벤치마크(동일 지표 단위) 평균 시계열 */
    benchmarkAvg: Record<MetricKey, number[]>
    series: Record<MetricKey, Record<string, number[]>>
  }
> = {
  daily: {
    labels: ['1/1', '1/2', '1/3', '1/4', '1/5', '1/6', '1/7'],
    benchmarkAvg: {
      study: [38, 41, 36, 48, 44, 42, 50],
      problems: [15, 16, 14, 19, 17, 16, 18],
      avgSec: [88, 86, 90, 87, 85, 87, 84],
    },
    series: {
      study: {
        수학: [45, 52, 38, 61, 55, 48, 70],
        역사: [12, 18, 15, 20, 22, 16, 19],
        국어: [30, 35, 28, 40, 33, 36, 42],
        영어: [50, 44, 58, 52, 60, 55, 63],
      },
      problems: {
        수학: [18, 22, 15, 28, 24, 20, 26],
        역사: [8, 10, 7, 12, 11, 9, 10],
        국어: [14, 16, 12, 18, 15, 17, 19],
        영어: [20, 18, 24, 22, 25, 23, 27],
      },
      avgSec: {
        수학: [95, 88, 102, 90, 86, 92, 84],
        역사: [72, 68, 75, 70, 74, 71, 69],
        국어: [110, 105, 118, 108, 112, 106, 104],
        영어: [78, 82, 75, 80, 77, 79, 76],
      },
    },
  },
  monthly: {
    labels: ['1월', '2월', '3월', '4월', '5월', '6월'],
    benchmarkAvg: {
      study: [285, 270, 300, 290, 305, 295],
      problems: [105, 98, 112, 108, 115, 110],
      avgSec: [88, 87, 89, 88, 86, 87],
    },
    series: {
      study: {
        수학: [320, 280, 350, 310, 360, 340],
        역사: [90, 110, 85, 95, 100, 88],
        국어: [240, 260, 220, 250, 270, 255],
        영어: [300, 290, 310, 305, 320, 315],
      },
      problems: {
        수학: [120, 105, 135, 118, 142, 128],
        역사: [45, 52, 40, 48, 50, 44],
        국어: [88, 92, 80, 95, 98, 90],
        영어: [110, 108, 115, 112, 118, 114],
      },
      avgSec: {
        수학: [92, 90, 94, 91, 89, 88],
        역사: [71, 73, 70, 72, 69, 70],
        국어: [108, 110, 106, 109, 107, 105],
        영어: [79, 81, 78, 80, 77, 78],
      },
    },
  },
}

function metricFormatter(metric: MetricKey): (v: number) => string {
  if (metric === 'study') return (v) => `${v}분`
  if (metric === 'problems') return (v) => `${v}문항`
  return (v) => `${v}초`
}

export function PassNavStudyTrendChart() {
  const [metric, setMetric] = useState<MetricKey>('study')
  const [period, setPeriod] = useState<PeriodKey>('daily')
  const [subject, setSubject] = useState<string>(() => SUBJECTS[0].key)

  const { chartData, chartSeries, yUnit } = useMemo(() => {
    const block = HARDCODED[period]
    const values = block.series[metric]
    const bench = block.benchmarkAvg[metric]
    const colorByKey = Object.fromEntries(SUBJECTS.map((s) => [s.key, s.color]))

    const data = block.labels.map((label, i) => {
      const row: Record<string, string | number> = { 기간: label }
      row[BENCHMARK_SERIES_NAME] = bench[i] ?? 0
      const arr = values[subject]
      row[subject] = arr?.[i] ?? 0
      return row
    })

    const benchmarkSeries = {
      name: BENCHMARK_SERIES_NAME,
      color: 'gray.7',
      strokeDasharray: '6 4',
    }
    const subjectSeries = {
      name: subject,
      color: colorByKey[subject] ?? 'gray.6',
    }
    const series = [benchmarkSeries, subjectSeries]

    const yUnit =
      metric === 'study' ? '분' : metric === 'problems' ? '문항' : '초'

    return { chartData: data, chartSeries: series, yUnit }
  }, [metric, period, subject])

  return (
    <Stack gap="sm" style={{ flex: 1, minWidth: 280 }}>
      <Text fw={600} size="sm">
        과목별 추이 (데모)
      </Text>

      <Group gap="xs" align="center" wrap="wrap">
        <Text size="xs" c="dimmed" w={56}>
          지표
        </Text>
        <SegmentedControl
          size="xs"
          value={metric}
          onChange={(v) => setMetric(v as MetricKey)}
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
          onChange={(v) => setPeriod(v as PeriodKey)}
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
          data={SUBJECTS.map((s) => ({ value: s.key, label: s.key }))}
        />
      </Group>

      <LineChart
        h={220}
        data={chartData}
        dataKey="기간"
        series={chartSeries}
        curveType="monotone"
        withDots
        withLegend
        gridAxis="xy"
        yAxisLabel={yUnit}
        valueFormatter={metricFormatter(metric)}
      />
    </Stack>
  )
}
