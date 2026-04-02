import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Group, List, Paper, Stack, Text, Title } from '@mantine/core'
import { lectureBrowseDeepLink } from '../../../lib/lectureVideosNav'
import { questionsBankDrillPath } from '../../../lib/questionsBankNav'
import type { PassNavDbAlertRow } from '../../../types/passNav'

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

function catalogIdFromRow(row: PassNavDbAlertRow): string | null {
  const rule = row.resolution_rule
  if (rule && typeof rule === 'object' && 'catalog_id' in rule) {
    const v = (rule as { catalog_id?: unknown }).catalog_id
    if (typeof v === 'string' && v.length > 0) return v
  }
  const cl = row.category_label
  if (cl?.startsWith('catalog:')) {
    const id = cl.slice('catalog:'.length).trim()
    return id || null
  }
  return null
}

/** `related_*` FK가 있을 때만 「관련 강의/교재/문제」. FK 없으면 카탈로그·mock_* 만 보조 링크(동일 라벨의 가짜 관련 버튼 방지) */
function dbAlertActions(row: PassNavDbAlertRow): { href: string; label: string }[] {
  const related: { href: string; label: string }[] = []
  const lecTo = lectureBrowseDeepLink(row.related_lecture_id)
  if (lecTo) {
    related.push({ href: lecTo, label: '관련 강의' })
  }
  if (row.related_ebook_page_id) {
    related.push({ href: '/ebook', label: '관련 교재' })
  }
  const drill = questionsBankDrillPath({
    subjectId: row.subject_id,
    questionId: row.related_question_id,
  })
  if (drill) {
    related.push({ href: drill, label: '관련 문제' })
  }
  if (related.length > 0) return related

  const cid = catalogIdFromRow(row)
  if (cid) {
    return [{ href: `/study/mock-exam/preview/${cid}`, label: '모의고사' }]
  }
  const code = row.alert_code ?? ''
  if (code.startsWith('mock_')) {
    return [{ href: '/study/mock-exam', label: '모의고사' }]
  }
  return []
}

function dbAlertSeverity(row: PassNavDbAlertRow): 'high' | 'medium' {
  const c = row.alert_code ?? ''
  if (
    c === 'required_path_missing' ||
    c === 'mastery_perf_accuracy_gap' ||
    c === 'mock_perf_accuracy'
  ) {
    return 'high'
  }
  return 'medium'
}

export function PassNavAlertCenter({ rows }: { rows: PassNavDbAlertRow[] }) {
  const [hist, setHist] = useState<string[]>(loadHist)
  const lastKeyRef = useRef('')

  useEffect(() => {
    if (rows.length === 0) return
    const key = rows
      .map((a) => a.id)
      .sort()
      .join('|')
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key
    const line = `${new Date().toISOString().slice(0, 16)} · ${rows.map((a) => a.title).join(', ')}`
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
  }, [rows])

  return (
    <Stack gap="md">
      <Title order={4}>알림 · 이탈 경보</Title>
      <Text size="sm" c="dimmed">
        서버에 저장된 미해소 알림입니다. (푸시·카카오는 추후 연동)
      </Text>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          표시할 알림이 없습니다.
        </Text>
      ) : null}
      {rows.map((a) => {
        const actions = dbAlertActions(a)
        const sev = dbAlertSeverity(a)
        return (
          <Alert key={a.id} color={sev === 'high' ? 'red' : 'yellow'} title={a.title}>
            <Text size="sm">{a.body}</Text>
            {a.alert_code ? (
              <Text size="xs" c="dimmed" mt={4}>
                {a.alert_code} · {new Date(a.created_at).toLocaleString('ko-KR')}
              </Text>
            ) : (
              <Text size="xs" c="dimmed" mt={4}>
                {new Date(a.created_at).toLocaleString('ko-KR')}
              </Text>
            )}
            {actions.length > 0 ? (
              <Group gap="xs" mt="sm" wrap="wrap">
                {actions.map((act) => (
                  <Button key={`${act.href}-${act.label}`} component="a" href={act.href} size="xs" variant="light">
                    {act.label}
                  </Button>
                ))}
              </Group>
            ) : null}
          </Alert>
        )
      })}
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
