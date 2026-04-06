import {
  Alert,
  Badge,
  Button,
  Group,
  MultiSelect,
  Paper,
  ScrollArea,
  Select,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFasttrackUserId } from '../../lib/fasttrackUser'
import {
  fetchUserQaQuestionsForSubject,
  fetchUserQaSubjectCounts,
  filterUserQaRows,
  type UserQaQuestionRow,
} from '../../lib/userQaQuestions'
import type { Subject } from '../../types/lectures'

function subjectLabel(s: Subject): string {
  return (s.category?.trim() || s.name).trim() || '과목'
}

export function StudyArchiveMyQuestionsTab({ subjects }: { subjects: Subject[] }) {
  const userId = useMemo(() => getFasttrackUserId(), [])
  const navigate = useNavigate()

  const [countsLoad, setCountsLoad] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [countsErr, setCountsErr] = useState<string | null>(null)
  const [counts, setCounts] = useState<Map<string, number>>(new Map())

  const [subjectId, setSubjectId] = useState<string | null>(null)
  const [rowsLoad, setRowsLoad] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [rowsErr, setRowsErr] = useState<string | null>(null)
  const [rows, setRows] = useState<UserQaQuestionRow[]>([])

  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setCountsLoad('loading')
    setCountsErr(null)
    void (async () => {
      try {
        const m = await fetchUserQaSubjectCounts(userId)
        if (!cancelled) {
          setCounts(m)
          setCountsLoad('ok')
        }
      } catch (e) {
        if (!cancelled) {
          setCountsLoad('err')
          setCountsErr(e instanceof Error ? e.message : '문항 수를 불러오지 못했습니다.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    setSelectedCats([])
    setSelectedTags([])
    if (!subjectId) {
      setRows([])
      setRowsLoad('idle')
      return
    }
    let cancelled = false
    setRowsLoad('loading')
    setRowsErr(null)
    void (async () => {
      try {
        const list = await fetchUserQaQuestionsForSubject(userId, subjectId)
        if (cancelled) return
        setRows(list)
        setRowsLoad('ok')
      } catch (e) {
        if (!cancelled) {
          setRowsLoad('err')
          setRowsErr(e instanceof Error ? e.message : '문항을 불러오지 못했습니다.')
          setRows([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, subjectId])

  const categories = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) {
      const c = r.category_label?.trim()
      if (c) s.add(c)
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [rows])

  const tags = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) {
      for (const t of r.tags ?? []) {
        const u = String(t).trim()
        if (u) s.add(u)
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [rows])

  const filteredCount = useMemo(() => {
    return filterUserQaRows(rows, { categoryLabels: selectedCats, tags: selectedTags }).length
  }, [rows, selectedCats, selectedTags])

  const subjectsWithQuestions = useMemo(() => {
    return subjects
      .filter((s) => (counts.get(s.id) ?? 0) > 0)
      .sort((a, b) => subjectLabel(a).localeCompare(subjectLabel(b), 'ko'))
  }, [subjects, counts])

  const subjectSelectData = useMemo(
    () =>
      subjectsWithQuestions.map((s) => ({
        value: s.id,
        label: `${subjectLabel(s)} (${counts.get(s.id) ?? 0})`,
      })),
    [subjectsWithQuestions, counts],
  )

  const startDrill = useCallback(() => {
    if (!subjectId) return
    const sp = new URLSearchParams()
    sp.set('subject', subjectId)
    for (const c of selectedCats) sp.append('cat', c)
    for (const t of selectedTags) sp.append('tag', t)
    navigate(`/study/archive/my-questions/drill?${sp.toString()}`)
  }, [subjectId, selectedCats, selectedTags, navigate])

  return (
    <Stack gap="lg">
      <div>
        <Text size="sm" c="dimmed" mb={4}>
          Study room
        </Text>
        <Title order={2}>내가 만든 문제</Title>
        <Text size="sm" c="dimmed" mt={6}>
          과목을 고른 뒤 카테고리·주제(tags)로 필터하고 드릴을 시작합니다. 풀이 화면은 문제은행 드릴과 같은 레이아웃입니다.
        </Text>
      </div>

      {countsLoad === 'err' && (
        <Alert color="red" title="불러오기 실패">
          {countsErr}
        </Alert>
      )}

      {countsLoad === 'loading' && (
        <Stack gap="sm">
          <Skeleton height={40} />
          <Skeleton height={120} />
        </Stack>
      )}

      {countsLoad === 'ok' && subjectsWithQuestions.length === 0 && (
        <Alert color="gray" title="문항이 없습니다">
          학습 아카이브의 Q&A 탭에서 대화를 선택해 문항을 생성하면 여기에 표시됩니다.
        </Alert>
      )}

      {countsLoad === 'ok' && subjectsWithQuestions.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Select
              label="과목"
              placeholder="과목 선택"
              data={subjectSelectData}
              value={subjectId}
              onChange={(v) => setSubjectId(v)}
              searchable
              nothingFoundMessage="해당 과목에 저장된 문항이 없습니다. Q&A 아카이브에서 문항을 만들어 주세요."
            />

            {subjectId && rowsLoad === 'loading' && <Skeleton height={88} />}

            {subjectId && rowsLoad === 'err' && (
              <Alert color="red" title="문항 로드 실패">
                {rowsErr}
              </Alert>
            )}

            {subjectId && rowsLoad === 'ok' && (
              <>
                <MultiSelect
                  label="카테고리 라벨"
                  placeholder="전체(선택 안 함)"
                  description="선택한 라벨 중 하나라도 해당하는 문항만 풀에 넣습니다."
                  data={categories}
                  value={selectedCats}
                  onChange={setSelectedCats}
                  searchable
                  clearable
                  disabled={categories.length === 0}
                />
                <MultiSelect
                  label="주제(tags)"
                  placeholder="전체(선택 안 함)"
                  description="선택한 태그 중 하나라도 붙은 문항만 포함합니다."
                  data={tags}
                  value={selectedTags}
                  onChange={setSelectedTags}
                  searchable
                  clearable
                  disabled={tags.length === 0}
                />

                <Group justify="space-between" align="center" wrap="wrap">
                  <Group gap="xs">
                    <Badge variant="light" color="teal">
                      풀 문항 {filteredCount}개
                    </Badge>
                    {rows.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        이 과목에 저장된 문항이 없습니다.
                      </Text>
                    ) : null}
                  </Group>
                  <Button
                    onClick={startDrill}
                    disabled={filteredCount === 0}
                  >
                    드릴 시작
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Paper>
      )}

      {countsLoad === 'ok' && subjectsWithQuestions.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Text size="sm" fw={600} mb="sm">
            과목별 문항 수
          </Text>
          <ScrollArea h={220} type="auto">
            <Stack gap="xs">
              {subjectsWithQuestions.map((s) => (
                <Group key={s.id} justify="space-between" wrap="nowrap">
                  <Text size="sm">{subjectLabel(s)}</Text>
                  <Badge variant="outline">{counts.get(s.id) ?? 0}개</Badge>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        </Paper>
      )}
    </Stack>
  )
}
