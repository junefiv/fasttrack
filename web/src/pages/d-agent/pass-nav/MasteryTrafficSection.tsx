import { Badge, Box, Button, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import type { PassNavHistoryItem } from '../../../lib/passNavAlerts'

const borderForTone = (tone: PassNavHistoryItem['tone']) => {
  if (tone === 'success') return '4px solid var(--mantine-color-teal-6)'
  if (tone === 'danger') return '4px solid var(--mantine-color-red-6)'
  return '4px solid var(--mantine-color-yellow-6)'
}

const titleColor = (tone: PassNavHistoryItem['tone']) => {
  if (tone === 'success') return 'var(--mantine-color-teal-4)'
  if (tone === 'danger') return 'var(--mantine-color-red-4)'
  return 'var(--mantine-color-yellow-4)'
}

function RemedyActions({ remedy }: { remedy: PassNavHistoryItem['remedy'] }) {
  const videoTo = remedy?.videoHref
  const ebookTo = remedy?.ebookHref
  const drillTo = remedy?.drillHref
  if (!videoTo && !ebookTo && !drillTo) return null

  return (
    <Stack gap={6} mt="sm">
      <Group gap="xs" wrap="wrap">
        {videoTo ? (
          <Button
            size="compact-xs"
            variant="light"
            color="cyan"
            component={Link}
            to={videoTo}
          >
            관련 강의
          </Button>
        ) : null}
        {ebookTo ? (
          <Button
            size="compact-xs"
            variant="light"
            color="grape"
            component={Link}
            to={ebookTo}
          >
            관련 교재
          </Button>
        ) : null}
        {drillTo ? (
          <Button
            size="compact-xs"
            variant="light"
            color="orange"
            component={Link}
            to={drillTo}
          >
            관련 문제
          </Button>
        ) : null}
      </Group>
    </Stack>
  )
}

export function MasteryTrafficSection({ items }: { items: PassNavHistoryItem[] }) {
  const total = items.length
  const dangerCount = items.filter((i) => i.tone === 'danger').length

  return (
    <Paper
      radius="md"
      p={0}
      withBorder
      mih={320}
      bg="dark.8"
      style={{ borderColor: 'var(--mantine-color-dark-4)', overflow: 'hidden' }}
    >
      <Box
        px="md"
        py="sm"
        style={{
          borderBottom: '1px solid var(--mantine-color-dark-5)',
          background: 'color-mix(in srgb, var(--mantine-color-dark-7) 85%, transparent)',
        }}
      >
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text size="sm" fw={700} c="gray.0" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden>🔔</span>
              이탈 경보 히스토리
            </Text>
          
          </Stack>
          {total > 0 ? (
            <Group gap={6} wrap="wrap" justify="flex-end" style={{ flexShrink: 0 }}>
              <Badge size="sm" color="dark" variant="light">
                미해소 {total}건
              </Badge>
              {dangerCount > 0 ? (
                <Badge size="sm" color="red" variant="filled">
                  고위험 {dangerCount}건
                </Badge>
              ) : null}
            </Group>
          ) : null}
        </Group>
      </Box>

      <ScrollArea.Autosize mah={560} type="auto" offsetScrollbars>
        <Stack gap="sm" p="md">
          {items.length === 0 ? (
            <Text size="sm" c="dimmed">
              현재 활성화된 이탈 경보가 없습니다. 데이터가 쌓이면 이곳에 시간순으로 쌓입니다.
            </Text>
          ) : (
            items.map((alert) => (
              <Box
                key={alert.id}
                p="sm"
                style={{
                  borderRadius: 8,
                  background: 'var(--mantine-color-dark-7)',
                  borderLeft: borderForTone(alert.tone),
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <Text size="xs" fw={700} mt={6} style={{ color: titleColor(alert.tone) }}>
                  {alert.title}
                </Text>
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                    {alert.displayTime}
                  </Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <Text size="xs" c="gray.2" mt={4} lh={1.45}>
                  {alert.body}
                </Text>
                <RemedyActions remedy={alert.remedy} />
                </div>
                
                
              </Box>
            ))
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Paper>
  )
}
