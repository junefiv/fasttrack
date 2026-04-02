import { BarChart } from '@mantine/charts'
import {
  Alert,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  useMantineColorScheme,
  useMantineTheme,
} from '@mantine/core'
import { useMemo, useState } from 'react'
import type { PassNavBundle, PassNavSubjectMetricRow } from '../../../types/passNav'
import {
  buildPassNavCategoryDetailRows,
  buildPassNavLectureDetailRows,
  type PassNavCategoryDetailRow,
  type PassNavLectureDetailRow,
} from '../../../lib/passNavModel'

type ChartMetricRow = {
  metric: string
  bench?: number
  user?: number
  benchFmt: string
  userFmt: string
}

/** 막대 높이용: 해당 지표에서 벤치·나 중 큰 값을 100으로 두는 상대값(0~100) */
type ChartPlotRow = {
  metric: string
  benchPlot?: number
  userPlot?: number
  benchFmt: string
  userFmt: string
}

function metricRowsToPlotRows(rows: ChartMetricRow[]): ChartPlotRow[] {
  return rows.map((row) => {
    const b = row.bench
    const u = row.user
    const hasB = typeof b === 'number' && !Number.isNaN(b)
    const hasU = typeof u === 'number' && !Number.isNaN(u)
    const out: ChartPlotRow = {
      metric: row.metric,
      benchFmt: row.benchFmt,
      userFmt: row.userFmt,
    }
    if (!hasB && !hasU) return out
    const max = Math.max(hasB ? b! : 0, hasU ? u! : 0, 1e-9)
    if (hasB) out.benchPlot = (b! / max) * 100
    if (hasU) out.userPlot = (u! / max) * 100
    return out
  })
}

function toChartData(p: {
  benchSec: number | null
  userSec: number | null
  benchCompletionPct: number | null
  userCompletionPct: number | null
  benchAccuracyPct: number | null
  userAccuracyPct: number | null
  benchConsecutiveDays: number | null
  userConsecutiveDays: number | null
}): ChartMetricRow[] {
  const speed: ChartMetricRow = {
    metric: '풀이 속도',
    benchFmt: p.benchSec != null ? `${p.benchSec.toFixed(1)}초` : '—',
    userFmt: p.userSec != null ? `${p.userSec.toFixed(1)}초` : '—',
  }
  if (p.benchSec != null) speed.bench = p.benchSec
  if (p.userSec != null) speed.user = p.userSec

  const lec: ChartMetricRow = {
    metric: '수강률',
    benchFmt: p.benchCompletionPct != null ? `${p.benchCompletionPct.toFixed(1)}%` : '—',
    userFmt: p.userCompletionPct != null ? `${p.userCompletionPct.toFixed(1)}%` : '—',
  }
  if (p.benchCompletionPct != null) lec.bench = p.benchCompletionPct
  if (p.userCompletionPct != null) lec.user = p.userCompletionPct

  const acc: ChartMetricRow = {
    metric: '정답률',
    benchFmt: p.benchAccuracyPct != null ? `${p.benchAccuracyPct.toFixed(1)}%` : '—',
    userFmt: p.userAccuracyPct != null ? `${p.userAccuracyPct.toFixed(1)}%` : '—',
  }
  if (p.benchAccuracyPct != null) acc.bench = p.benchAccuracyPct
  if (p.userAccuracyPct != null) acc.user = p.userAccuracyPct

  const streak: ChartMetricRow = {
    metric: '연속 학습일',
    benchFmt: p.benchConsecutiveDays != null ? `${p.benchConsecutiveDays.toFixed(1)}일` : '—',
    userFmt: p.userConsecutiveDays != null ? `${p.userConsecutiveDays.toFixed(1)}일` : '—',
  }
  if (p.benchConsecutiveDays != null) streak.bench = p.benchConsecutiveDays
  if (p.userConsecutiveDays != null) streak.user = p.userConsecutiveDays

  return [speed, lec, acc, streak]
}

function chartHasValues(data: ChartMetricRow[]): boolean {
  return data.some((d) => typeof d.bench === 'number' || typeof d.user === 'number')
}

function hasAnyValue(r: PassNavSubjectMetricRow): boolean {
  return (
    r.benchSec != null ||
    r.userSec != null ||
    r.benchCompletionPct != null ||
    r.userCompletionPct != null ||
    r.benchAccuracyPct != null ||
    r.userAccuracyPct != null ||
    r.benchConsecutiveDays != null ||
    r.userConsecutiveDays != null
  )
}

/** 탭에 나온 모든 과목 행 기준, 값이 있는 과목만 포함해 산술평균 */
function meanAcrossSubjects(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v != null && !Number.isNaN(v))
  if (xs.length === 0) return null
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

type ModalMetric = '풀이 속도' | '수강률' | '정답률' | '연속 학습일'

function isModalMetric(s: string): s is ModalMetric {
  return s === '풀이 속도' || s === '수강률' || s === '정답률' || s === '연속 학습일'
}

function categoryHasSpeedOrAcc(r: PassNavCategoryDetailRow): boolean {
  return (
    r.benchSolveTime != null ||
    r.userSolveTime != null ||
    r.benchAccuracy != null ||
    r.userAccuracy != null
  )
}

function lectureHasCompletionOrStreak(r: PassNavLectureDetailRow): boolean {
  return (
    r.benchCompletion != null ||
    r.userCompletion != null ||
    r.benchConsecutive != null ||
    r.userConsecutive != null
  )
}

/** Recharts Bar onClick: (data, index, e) — data에 payload로 원본 행이 붙음 */
function chartRowFromBarClick(data: unknown): ChartPlotRow | undefined {
  if (!data || typeof data !== 'object') return undefined
  const p = (data as { payload?: ChartPlotRow }).payload
  return p?.metric ? p : undefined
}

export function SolveSpeedBarSection({
  selectedSubjectTab,
  rows,
  hasBenchmark,
  bundle,
}: {
  selectedSubjectTab: string
  rows: PassNavSubjectMetricRow[]
  hasBenchmark: boolean
  bundle: PassNavBundle
}) {
  const theme = useMantineTheme()
  const { colorScheme } = useMantineColorScheme()
  const labelFill = colorScheme === 'dark' ? theme.colors.gray[2] : theme.colors.gray[8]

  const [modalMetric, setModalMetric] = useState<ModalMetric | null>(null)

  const sorted = [...rows].sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ko'))
  const avgBenchSec = meanAcrossSubjects(sorted.map((r) => r.benchSec))
  const avgUserSec = meanAcrossSubjects(sorted.map((r) => r.userSec))
  const avgBenchLec = meanAcrossSubjects(sorted.map((r) => r.benchCompletionPct))
  const avgUserLec = meanAcrossSubjects(sorted.map((r) => r.userCompletionPct))
  const avgBenchAcc = meanAcrossSubjects(sorted.map((r) => r.benchAccuracyPct))
  const avgUserAcc = meanAcrossSubjects(sorted.map((r) => r.userAccuracyPct))
  const avgBenchStreak = meanAcrossSubjects(sorted.map((r) => r.benchConsecutiveDays))
  const avgUserStreak = meanAcrossSubjects(sorted.map((r) => r.userConsecutiveDays))

  const avgData = toChartData({
    benchSec: avgBenchSec,
    userSec: avgUserSec,
    benchCompletionPct: avgBenchLec,
    userCompletionPct: avgUserLec,
    benchAccuracyPct: avgBenchAcc,
    userAccuracyPct: avgUserAcc,
    benchConsecutiveDays: avgBenchStreak,
    userConsecutiveDays: avgUserStreak,
  })

  const nBenchSp = sorted.filter((r) => r.benchSec != null && !Number.isNaN(r.benchSec)).length
  const nUserSp = sorted.filter((r) => r.userSec != null && !Number.isNaN(r.userSec)).length
  const nBenchLec = sorted.filter((r) => r.benchCompletionPct != null && !Number.isNaN(r.benchCompletionPct)).length
  const nUserLec = sorted.filter((r) => r.userCompletionPct != null && !Number.isNaN(r.userCompletionPct)).length
  const nBenchAcc = sorted.filter((r) => r.benchAccuracyPct != null && !Number.isNaN(r.benchAccuracyPct)).length
  const nUserAcc = sorted.filter((r) => r.userAccuracyPct != null && !Number.isNaN(r.userAccuracyPct)).length
  const nBenchStreak = sorted.filter((r) => r.benchConsecutiveDays != null && !Number.isNaN(r.benchConsecutiveDays))
    .length
  const nUserStreak = sorted.filter((r) => r.userConsecutiveDays != null && !Number.isNaN(r.userConsecutiveDays)).length

  const subjectRow =
    selectedSubjectTab === '__avg' ? null : sorted.find((x) => x.subjectId === selectedSubjectTab)

  const subjectScope = selectedSubjectTab === '__avg' ? '__avg' : selectedSubjectTab
  const subjectTitle =
    selectedSubjectTab === '__avg'
      ? '전체(AVG)'
      : sorted.find((r) => r.subjectId === selectedSubjectTab)?.subjectName ?? '과목'

  const categoryRows = useMemo(
    () => buildPassNavCategoryDetailRows(bundle, subjectScope).filter(categoryHasSpeedOrAcc),
    [bundle, subjectScope],
  )
  const lectureRows = useMemo(
    () => buildPassNavLectureDetailRows(bundle, subjectScope).filter(lectureHasCompletionOrStreak),
    [bundle, subjectScope],
  )

  const openBarDetail = (payload: ChartPlotRow | undefined) => {
    const m = payload?.metric
    if (m && isModalMetric(m)) setModalMetric(m)
  }

  const chart = (data: ChartMetricRow[]) => {
    if (data.length === 0 || !chartHasValues(data)) {
      return (
        <Text size="sm" c="dimmed">
          표시할 데이터가 없습니다. user_mastery_stats·user_mock_exam_stats·user_lecture_stats·강의 메타(lectures)와
          벤치마크 행을 확인하세요.
        </Text>
      )
    }
    const plotData = metricRowsToPlotRows(data)
    return (
      <BarChart
        h={480}
        data={plotData}
        dataKey="metric"
        orientation="horizontal"
        series={[
          { name: 'benchPlot', color: 'gray.5', label: '벤치마크' },
          { name: 'userPlot', color: 'teal.6', label: '나' },
        ]}
        withLegend
        withTooltip
        withBarValueLabel
        barProps={() => ({
          style: { cursor: 'pointer' },
          onClick: (barData: unknown) => openBarDetail(chartRowFromBarClick(barData)),
        })}
        valueFormatter={(v) => {
          if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '—'
          if (typeof v === 'string') return v
          return `${Number(v).toFixed(0)}%`
        }}
        valueLabelProps={(series) => ({
          dataKey: series.name === 'benchPlot' ? 'benchFmt' : 'userFmt',
          position: 'top',
          offset: 10,
          fontSize: 12,
          fontWeight: 600,
          fill: labelFill,
        })}
        withYAxis={false}
        yAxisProps={{ domain: [0, 100] }}
        xAxisLabel=""
        tickLine="x"
        gridAxis="x"
        barChartProps={{ margin: { top: 28, right: 8, left: 8, bottom: 8 } }}
        tooltipProps={{
          content: ({ active, payload }) => {
            if (!active || !payload?.[0]) return null
            const row = payload[0].payload as ChartPlotRow
            return (
              <Paper shadow="sm" p="xs" radius="sm" withBorder>
                <Text size="sm" fw={600}>
                  {row.metric}
                </Text>
                <Text size="xs">벤치마크: {row.benchFmt}</Text>
                <Text size="xs">나: {row.userFmt}</Text>
                <Text size="xs" c="dimmed" mt={4}>
                  막대 높이는 이 지표 안에서만 벤치·나 중 큰 값 = 100% 기준입니다.
                </Text>
                <Text size="xs" c="dimmed" mt={6}>
                  클릭하면 상세(분류 또는 강의별)를 엽니다.
                </Text>
              </Paper>
            )
          },
        }}
      />
    )
  }

  return (
    <Stack gap="sm">
      
      {!hasBenchmark ? (
        <Alert color="yellow" title="벤치마크 미연결">
          목표 대학·학과에 맞는 university_benchmarks 행이 없으면 벤치마크 막대가 비어 있습니다.
        </Alert>
      ) : null}
      {selectedSubjectTab === '__avg' ? (
        <>
          <Text size="xs" c="dimmed" mb="xs">
            과목 {sorted.length}개 기준 산술평균 — 풀이 속도: 벤치 n={nBenchSp}, 나 n={nUserSp} / 수강률: 벤치 n=
            {nBenchLec}, 나 n={nUserLec} / 정답률: 벤치 n={nBenchAcc}, 나 n={nUserAcc} / 연속 학습일: 벤치 n=
            {nBenchStreak}, 나 n={nUserStreak}.
          </Text>
          {chart(avgData)}
        </>
      ) : !subjectRow ? (
        <Text size="sm" c="dimmed">
          선택한 과목을 찾을 수 없습니다.
        </Text>
      ) : !hasAnyValue(subjectRow) ? (
        <Text size="sm" c="dimmed">
          이 과목의 표시할 데이터가 없습니다.
        </Text>
      ) : (
        chart(
          toChartData({
            benchSec: subjectRow.benchSec,
            userSec: subjectRow.userSec,
            benchCompletionPct: subjectRow.benchCompletionPct,
            userCompletionPct: subjectRow.userCompletionPct,
            benchAccuracyPct: subjectRow.benchAccuracyPct,
            userAccuracyPct: subjectRow.userAccuracyPct,
            benchConsecutiveDays: subjectRow.benchConsecutiveDays,
            userConsecutiveDays: subjectRow.userConsecutiveDays,
          }),
        )
      )}

      <Modal
        opened={modalMetric != null}
        onClose={() => setModalMetric(null)}
        title={
          <Text fw={700} size="lg">
            {modalMetric ? `${modalMetric} — ${subjectTitle}` : ''}
          </Text>
        }
        size="lg"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        {modalMetric === '풀이 속도' ? (
          <CategorySpeedTable rows={categoryRows} showSubject={subjectScope === '__avg'} />
        ) : null}
        {modalMetric === '정답률' ? (
          <CategoryAccuracyTable rows={categoryRows} showSubject={subjectScope === '__avg'} />
        ) : null}
        {modalMetric === '수강률' ? (
          <LectureCompletionTable rows={lectureRows} showSubject={subjectScope === '__avg'} />
        ) : null}
        {modalMetric === '연속 학습일' ? (
          <LectureStreakTable rows={lectureRows} showSubject={subjectScope === '__avg'} />
        ) : null}
      </Modal>
    </Stack>
  )
}

function CategorySpeedTable({
  rows,
  showSubject,
}: {
  rows: PassNavCategoryDetailRow[]
  showSubject: boolean
}) {
  if (rows.length === 0) {
    return <Text size="sm" c="dimmed">표시할 분류(category_label) 데이터가 없습니다.</Text>
  }
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        마스터리(user_mastery_stats·benchmark_mastery_stats)와 모의고사 JSON(user_mock_exam_stats.category_detail_stats /
        benchmark_mock_exam_stats.category_detail_benchmarks)의 키를 category_label로 합칩니다. 동일 분류가 양쪽에 있으면 값은
        평균으로 합칩니다.
      </Text>
      <Table.ScrollContainer minWidth={420}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              {showSubject ? <Table.Th>과목</Table.Th> : null}
              <Table.Th>분류</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>벤치(초)</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>나(초)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={`${r.subjectId}-${r.category_label}`}>
                {showSubject ? <Table.Td>{r.subjectName}</Table.Td> : null}
                <Table.Td>{r.category_label}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {r.benchSolveTime != null ? r.benchSolveTime.toFixed(1) : '—'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {r.userSolveTime != null ? r.userSolveTime.toFixed(1) : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  )
}

function CategoryAccuracyTable({
  rows,
  showSubject,
}: {
  rows: PassNavCategoryDetailRow[]
  showSubject: boolean
}) {
  if (rows.length === 0) {
    return <Text size="sm" c="dimmed">표시할 분류(category_label) 데이터가 없습니다.</Text>
  }
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        마스터리와 모의고사 category_detail JSON을 동일 규칙으로 합칩니다.
      </Text>
      <Table.ScrollContainer minWidth={420}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              {showSubject ? <Table.Th>과목</Table.Th> : null}
              <Table.Th>분류</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>벤치(%)</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>나(%)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={`${r.subjectId}-${r.category_label}`}>
                {showSubject ? <Table.Td>{r.subjectName}</Table.Td> : null}
                <Table.Td>{r.category_label}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {r.benchAccuracy != null ? r.benchAccuracy.toFixed(1) : '—'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {r.userAccuracy != null ? r.userAccuracy.toFixed(1) : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  )
}

function LectureCompletionTable({
  rows,
  showSubject,
}: {
  rows: PassNavLectureDetailRow[]
  showSubject: boolean
}) {
  if (rows.length === 0) {
    return <Text size="sm" c="dimmed">표시할 강의별 수강률 데이터가 없습니다.</Text>
  }
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        수강률은 강의(lecture) 단위입니다. 벤치는 해당 강의에 benchmark_lecture_stats가 있을 때만 표시됩니다.
      </Text>
      <Table.ScrollContainer minWidth={480}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              {showSubject ? <Table.Th>과목</Table.Th> : null}
              <Table.Th>강의</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>벤치(%)</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>나(%)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.lectureId}>
                {showSubject ? <Table.Td>{r.subjectName}</Table.Td> : null}
                <Table.Td>{r.lectureTitle}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {r.benchCompletion != null ? r.benchCompletion.toFixed(1) : '—'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {r.userCompletion != null ? r.userCompletion.toFixed(1) : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  )
}

function LectureStreakTable({
  rows,
  showSubject,
}: {
  rows: PassNavLectureDetailRow[]
  showSubject: boolean
}) {
  if (rows.length === 0) {
    return <Text size="sm" c="dimmed">표시할 강의별 연속 학습일 데이터가 없습니다.</Text>
  }
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        연속 학습일은 강의 통계의 consecutive_learning_days 기준입니다.
      </Text>
      <Table.ScrollContainer minWidth={480}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              {showSubject ? <Table.Th>과목</Table.Th> : null}
              <Table.Th>강의</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>벤치(일)</Table.Th>
              <Table.Th style={{ textAlign: 'right' }}>나(일)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.lectureId}>
                {showSubject ? <Table.Td>{r.subjectName}</Table.Td> : null}
                <Table.Td>{r.lectureTitle}</Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {r.benchConsecutive != null ? r.benchConsecutive.toFixed(1) : '—'}
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  {r.userConsecutive != null ? r.userConsecutive.toFixed(1) : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  )
}
