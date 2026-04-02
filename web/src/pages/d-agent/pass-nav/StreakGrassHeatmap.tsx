import { Box, Group, Paper, Stack, Text } from '@mantine/core'
import type { PassNavBundle } from '../../../types/passNav'

export function StreakGrassHeatmap({ bundle, subjectId }: { bundle: PassNavBundle; subjectId: string }) {
  const benchByLecture = new Map(bundle.benchLecture.map((b) => [b.lecture_id, b]))
  const lectureById = new Map(bundle.lectures.map((l) => [l.id, l]))

  const rows = bundle.userLecture.filter((u) => lectureById.get(u.lecture_id)?.subject_id === subjectId)

  return (
    <Box>
      <Text size="sm" c="dimmed" mb={8}>
        연속 학습 잔디 (선택 과목 · 강좌별 최대 14칸 · 진한 초록=연속일)
      </Text>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          이 과목에 연결된 수강 강의(user_lecture_stats + lectures 메타)가 없습니다.
        </Text>
      ) : (
        <Stack gap="xs">
          {rows.map((u) => {
            const b = benchByLecture.get(u.lecture_id)
            const userStreak = Math.min(14, Math.max(0, u.consecutive_learning_days ?? 0))
            const benchStreak = Math.min(14, Math.max(0, b?.consecutive_learning_days ?? 0))
            const label = lectureById.get(u.lecture_id)?.title ?? u.lecture_id.slice(0, 8)
            return (
              <Paper key={u.lecture_id} withBorder p="xs" radius="sm">
                <Text size="xs" mb={6} lineClamp={1}>
                  {label}
                </Text>
                <Group gap={4}>
                  {Array.from({ length: 14 }).map((_, i) => {
                    const filled = i < userStreak
                    const benchMark = i === Math.min(benchStreak, 13)
                    return (
                      <Box
                        key={i}
                        w={12}
                        h={12}
                        style={{
                          borderRadius: 2,
                          background: filled ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-dark-6)',
                          outline: benchMark ? '1px solid var(--mantine-color-gray-5)' : undefined,
                        }}
                      />
                    )
                  })}
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  나 {userStreak}일 · 벤치 평균 {benchStreak}일(해당 강좌)
                </Text>
              </Paper>
            )
          })}
        </Stack>
      )}
    </Box>
  )
}
