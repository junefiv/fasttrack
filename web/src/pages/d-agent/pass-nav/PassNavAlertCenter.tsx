import { useEffect, useRef, useState } from 'react'
import { Alert, Button, List, Paper, Stack, Text, Title } from '@mantine/core'
import type { PassNavAlert } from '../../../lib/passNavAlerts'

const HKEY = 'fasttrack-passnav-alert-history-v1'

function loadHist(): string[] {
  try {
    const raw = localStorage.getItem(HKEY)
    if (raw) return JSON.parse(raw) as string[]
  } catch {
    /* ignore */
  }
  return []
}

export function PassNavAlertCenter({ alerts }: { alerts: PassNavAlert[] }) {
  const [hist, setHist] = useState<string[]>(loadHist)
  const lastKeyRef = useRef('')

  useEffect(() => {
    if (alerts.length === 0) return
    const key = alerts
      .map((a) => a.id)
      .sort()
      .join('|')
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key
    const line = `${new Date().toISOString().slice(0, 16)} · ${alerts.map((a) => a.title).join(', ')}`
    const t = window.setTimeout(() => {
      setHist((prev) => {
        const next = [line, ...prev].slice(0, 30)
        try {
          localStorage.setItem(HKEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    }, 0)
    return () => window.clearTimeout(t)
  }, [alerts])

  return (
    <Stack gap="md">
      <Title order={4}>알림 · 이탈 경보</Title>
      <Text size="sm" c="dimmed">
        트리거-액션 요약 (푸시·카카오는 추후 연동)
      </Text>
      {alerts.map((a) => (
        <Alert key={a.id} color={a.severity === 'high' ? 'red' : 'yellow'} title={a.title}>
          <Text size="sm">{a.body}</Text>
          {a.actionHref ? (
            <Button component="a" href={a.actionHref} size="xs" mt="sm" variant="light">
              {a.actionLabel ?? '이동'}
            </Button>
          ) : null}
        </Alert>
      ))}
      <Paper withBorder p="md">
        <Title order={5} mb="xs">
          히스토리 (로컬)
        </Title>
        {hist.length === 0 ? (
          <Text size="sm" c="dimmed">
            기록 없음
          </Text>
        ) : (
          <List size="sm" spacing="xs">
            {hist.map((h, i) => (
              <List.Item key={i}>{h}</List.Item>
            ))}
          </List>
        )}
      </Paper>
    </Stack>
  )
}
