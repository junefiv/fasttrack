import { Code, Paper, Stack, Table, Text, Title } from '@mantine/core'
import type { PassNavBundle } from '../../../types/passNav'

function JsonBlock({ v }: { v: Record<string, unknown> | null | undefined }) {
  if (!v || Object.keys(v).length === 0) return <Text c="dimmed">데이터 없음</Text>
  return (
    <Code block style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>
      {JSON.stringify(v, null, 2)}
    </Code>
  )
}

export function PassNavDetailAnalysis({ bundle }: { bundle: PassNavBundle }) {
  const catById = new Map(bundle.catalogs.map((c) => [c.id, c.title]))
  return (
    <Stack gap="xl">
      <section>
        <Title order={4} mb="sm">
          모의고사 · category_detail (JSON)
        </Title>
        <Text size="sm" c="dimmed" mb="xs">
          user_mock_exam_stats.category_detail_stats vs benchmark_mock_exam_stats.category_detail_benchmarks
        </Text>
        {bundle.userMock.map((u) => {
          const bench = bundle.benchMock.find((b) => b.catalog_id === u.catalog_id)
          return (
            <Paper key={u.id} withBorder p="md" radius="md" mb="md">
              <Text fw={600} mb="xs">
                {catById.get(u.catalog_id) ?? u.catalog_id}
              </Text>
              <Stack gap="sm">
                <div>
                  <Text size="xs" c="dimmed">
                    나
                  </Text>
                  <JsonBlock v={u.category_detail_stats as Record<string, unknown>} />
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    벤치마크
                  </Text>
                  <JsonBlock v={bench?.category_detail_benchmarks as Record<string, unknown>} />
                </div>
              </Stack>
            </Paper>
          )
        })}
      </section>

      <section>
        <Title order={4} mb="sm">
          정시 시험별 스탯
        </Title>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>시험</Table.Th>
              <Table.Th>과목</Table.Th>
              <Table.Th>나 점수</Table.Th>
              <Table.Th>목표 정답률</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {bundle.userOfficial.map((u) => {
              const sub = bundle.subjects.find((s) => s.id === u.subject_id)?.name ?? u.subject_id
              const bench = bundle.benchOfficial.find(
                (b) => b.exam_name === u.exam_name && b.subject_id === u.subject_id,
              )
              return (
                <Table.Tr key={u.id}>
                  <Table.Td>{u.exam_name}</Table.Td>
                  <Table.Td>{sub}</Table.Td>
                  <Table.Td>{u.total_score != null ? u.total_score : '—'}</Table.Td>
                  <Table.Td>{bench ? bench.target_correct_rate : '—'}</Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </section>
    </Stack>
  )
}
