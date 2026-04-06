import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  Tabs,
} from '@mantine/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  formatArchiveThreadsForPrompt,
  generateStudyQuestionsFromArchiveThreads,
  parseStudyArchiveQuestionsJson,
  type StudyArchiveQuestionItem,
} from '../../lib/gemini'
import {
  deleteUserLectureQaThread,
  deleteUserLectureQaThreads,
  ensureFasttrackUserExists,
  fetchUserLectureQaThreadsForArchive,
  userLectureQaRowToThread,
  type UserLectureQaArchiveRow,
} from '../../lib/userLectureQaThreads'
import { insertUserQaQuestionsFromArchive } from '../../lib/userQaQuestions'
import { getFasttrackUserId } from '../../lib/fasttrackUser'
import { formatTimestamp } from '../../lib/formatTime'
import { supabase } from '../../lib/supabase'
import type { Lecture, LectureSession, Subject } from '../../types/lectures'
import { StudyArchiveMyQuestionsTab } from './StudyArchiveMyQuestionsTab'
import './StudyArchivePage.css'

type ArchivePath = {
  subjectId: string | null
  instructor: string | null
  lectureId: string | null
  /** null: 아직 회차 단계 아님 | 'all': 강좌 내 전체 | uuid: 해당 회차만 */
  sessionFilter: 'all' | string | null
}

const emptyPath: ArchivePath = {
  subjectId: null,
  instructor: null,
  lectureId: null,
  sessionFilter: null,
}

function subjectLabel(s: Subject): string {
  return (s.category?.trim() || s.name).trim() || '과목'
}

function firstUserSnippet(messages: { role: string; text: string }[], max = 72): string {
  const u = messages.find((m) => m.role === 'user' && m.text.trim())
  const t = (u?.text ?? messages[0]?.text ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t || '(대화 없음)'
  return `${t.slice(0, max)}…`
}

function kindLabel(k: StudyArchiveQuestionItem['kind']): string {
  switch (k) {
    case 'multiple_choice':
      return '객관식'
    case 'short_answer':
      return '단답'
    case 'ox':
      return 'O/X'
    case 'essay':
      return '서술'
    default:
      return k
  }
}

function qaInstructionLine(q: StudyArchiveQuestionItem): string {
  return q.instruction.trim() || q.stem?.trim() || ''
}

function filterThreadsForPath(rows: UserLectureQaArchiveRow[], path: ArchivePath): UserLectureQaArchiveRow[] {
  let r = rows
  if (path.subjectId) r = r.filter((x) => x.subject_id === path.subjectId)
  if (path.instructor) {
    const key = path.instructor.trim()
    r = r.filter((x) => x.instructor_name.trim() === key)
  }
  if (path.lectureId) r = r.filter((x) => x.lecture_id === path.lectureId)
  if (path.sessionFilter && path.sessionFilter !== 'all') {
    r = r.filter((x) => x.lecture_session_id === path.sessionFilter)
  }
  return r
}

function countThreadsForPath(rows: UserLectureQaArchiveRow[], path: ArchivePath): number {
  return filterThreadsForPath(rows, path).length
}

export function StudyArchivePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const archiveTab = searchParams.get('tab') === 'my-questions' ? 'my-questions' : 'qa'

  const userId = useMemo(() => getFasttrackUserId(), [])
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? ''

  const [load, setLoad] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [sessions, setSessions] = useState<LectureSession[]>([])
  const [archiveRows, setArchiveRows] = useState<UserLectureQaArchiveRow[]>([])

  const [path, setPath] = useState<ArchivePath>(emptyPath)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [questionCount, setQuestionCount] = useState(5)
  const [genOpen, setGenOpen] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [genPersistErr, setGenPersistErr] = useState<string | null>(null)
  const [genPersistOk, setGenPersistOk] = useState<string | null>(null)
  const [genQuestions, setGenQuestions] = useState<StudyArchiveQuestionItem[]>([])

  type DeleteModalState =
    | null
    | { kind: 'single'; id: string; preview: string }
    | { kind: 'bulk'; ids: string[] }

  const [deleteModal, setDeleteModal] = useState<DeleteModalState>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoad('loading')
    setErrMsg(null)

    void (async () => {
      const { error: uerr } = await ensureFasttrackUserExists(userId)
      if (uerr && !cancelled) console.warn('[fasttrack_users]', uerr.message)

      try {
        const [subRes, lecRes, sesRes, arch] = await Promise.all([
          supabase.from('subjects').select('id,name,category').order('name'),
          supabase.from('lectures').select('id,subject_id,instructor,title,series_description').order('title'),
          supabase.from('lecture_sessions').select('id,lecture_id,title,session_order').order('session_order'),
          fetchUserLectureQaThreadsForArchive(userId),
        ])

        if (cancelled) return

        if (subRes.error || lecRes.error || sesRes.error) {
          const msg = subRes.error?.message ?? lecRes.error?.message ?? sesRes.error?.message
          setLoad('err')
          setErrMsg(msg ?? '데이터를 불러오지 못했습니다.')
          return
        }

        setSubjects((subRes.data ?? []) as Subject[])
        setLectures((lecRes.data ?? []) as Lecture[])
        setSessions((sesRes.data ?? []) as LectureSession[])
        setArchiveRows(arch)
        setLoad('ok')
      } catch (e) {
        if (!cancelled) {
          setLoad('err')
          setErrMsg(e instanceof Error ? e.message : '아카이브를 불러오지 못했습니다.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userId])

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const lectureById = useMemo(() => new Map(lectures.map((l) => [l.id, l])), [lectures])
  const sessionsByLecture = useMemo(() => {
    const m = new Map<string, LectureSession[]>()
    for (const s of sessions) {
      const arr = m.get(s.lecture_id) ?? []
      arr.push(s)
      m.set(s.lecture_id, arr)
    }
    return m
  }, [sessions])

  /** 현재 빵크럼(뎁스)에 맞게 필터된 대화 — 과목만 골라도 해당 과목 전체가 보임 */
  const threadsAtStep = useMemo(() => {
    return filterThreadsForPath(archiveRows, path).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
  }, [archiveRows, path])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [path])

  const navSubjects = useMemo(() => {
    const ids = new Set<string>()
    for (const r of archiveRows) ids.add(r.subject_id)
    return [...ids]
      .map((id) => subjectById.get(id))
      .filter((x): x is Subject => x != null)
      .sort((a, b) => subjectLabel(a).localeCompare(subjectLabel(b), 'ko'))
  }, [archiveRows, subjectById])

  const navInstructorsForSubject = useMemo(() => {
    if (!path.subjectId) return []
    const set = new Set<string>()
    for (const r of archiveRows) {
      if (r.subject_id === path.subjectId) set.add(r.instructor_name.trim() || '이름 없음')
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [archiveRows, path.subjectId])

  const navLecturesForSubjectAndInstructor = useMemo(() => {
    if (!path.subjectId || !path.instructor) return []
    const inst = path.instructor.trim()
    const ids = new Set<string>()
    for (const r of archiveRows) {
      if (r.subject_id !== path.subjectId) continue
      if ((r.instructor_name.trim() || '이름 없음') !== inst) continue
      ids.add(r.lecture_id)
    }
    return [...ids]
      .map((id) => lectureById.get(id))
      .filter((x): x is Lecture => x != null)
      .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  }, [archiveRows, path.subjectId, path.instructor, lectureById])

  const navSessionsForLecture = useMemo(() => {
    if (!path.lectureId) return []
    return sessionsByLecture.get(path.lectureId) ?? []
  }, [path.lectureId, sessionsByLecture])

  const breadcrumbItems = useMemo(() => {
    type Seg = { label: string; path: ArchivePath }
    const segs: Seg[] = [{ label: '전체', path: emptyPath }]
    if (path.subjectId) {
      const s = subjectById.get(path.subjectId)
      segs.push({
        label: s ? subjectLabel(s) : '과목',
        path: { ...emptyPath, subjectId: path.subjectId },
      })
    }
    if (path.instructor) {
      segs.push({
        label: path.instructor,
        path: {
          subjectId: path.subjectId,
          instructor: path.instructor,
          lectureId: null,
          sessionFilter: null,
        },
      })
    }
    if (path.lectureId) {
      const L = lectureById.get(path.lectureId)
      segs.push({
        label: L?.title ?? '강좌',
        path: {
          subjectId: path.subjectId,
          instructor: path.instructor,
          lectureId: path.lectureId,
          sessionFilter: null,
        },
      })
    }
    if (path.sessionFilter) {
      segs.push({
        label:
          path.sessionFilter === 'all'
            ? '전체 회차'
            : navSessionsForLecture.find((s) => s.id === path.sessionFilter)?.title ?? '회차',
        path,
      })
    }
    return segs.map((seg, i) => {
      const isLast = i === segs.length - 1
      return {
        label: seg.label,
        onClick: isLast ? undefined : () => setPath(seg.path),
      }
    })
  }, [path, subjectById, lectureById, navSessionsForLecture])

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const selectAllVisible = useCallback(() => {
    if (threadsAtStep.length === 0) return
    setSelectedIds(new Set(threadsAtStep.map((r) => r.id)))
  }, [threadsAtStep])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const openDeleteModal = useCallback((row: UserLectureQaArchiveRow) => {
    const msgs = userLectureQaRowToThread(row).messages
    setDeleteError(null)
    setDeleteModal({ kind: 'single', id: row.id, preview: firstUserSnippet(msgs, 120) })
  }, [])

  const openBulkDeleteModal = useCallback(() => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setDeleteError(null)
    setDeleteModal({ kind: 'bulk', ids })
  }, [selectedIds])

  const confirmDelete = useCallback(async () => {
    if (!deleteModal) return
    setDeleteLoading(true)
    setDeleteError(null)

    if (deleteModal.kind === 'single') {
      const { error } = await deleteUserLectureQaThread({ userId, threadId: deleteModal.id })
      setDeleteLoading(false)
      if (error) {
        setDeleteError(error.message)
        return
      }
      const removedId = deleteModal.id
      setDeleteModal(null)
      setArchiveRows((prev) => prev.filter((r) => r.id !== removedId))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(removedId)
        return next
      })
      return
    }

    const { error } = await deleteUserLectureQaThreads({ userId, threadIds: deleteModal.ids })
    setDeleteLoading(false)
    if (error) {
      setDeleteError(error.message)
      return
    }
    const removed = new Set(deleteModal.ids)
    setDeleteModal(null)
    setArchiveRows((prev) => prev.filter((r) => !removed.has(r.id)))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of removed) next.delete(id)
      return next
    })
  }, [deleteModal, userId])

  const runGenerate = useCallback(async () => {
    if (!apiKey) {
      setGenError('VITE_GEMINI_API_KEY 가 없습니다. web/.env.local 을 확인하세요.')
      setGenOpen(true)
      return
    }
    const picked = archiveRows.filter((r) => selectedIds.has(r.id))
    if (picked.length === 0) {
      setGenError('문항으로 쓸 대화를 한 개 이상 선택하세요.')
      setGenOpen(true)
      return
    }

    const subjectIdSet = new Set(picked.map((r) => r.subject_id))
    if (subjectIdSet.size !== 1) {
      setGenError('저장하려면 선택한 대화가 같은 과목이어야 합니다.')
      setGenOpen(true)
      return
    }

    setGenOpen(true)
    setGenLoading(true)
    setGenError(null)
    setGenPersistErr(null)
    setGenPersistOk(null)
    setGenQuestions([])

    try {
      const blocks = picked.map((row) => {
        const lec = row.lectures ?? lectureById.get(row.lecture_id)
        const sub = row.subject_id ? subjectById.get(row.subject_id) : undefined
        const ses = row.lecture_session_id
          ? row.lecture_sessions ?? sessions.find((s) => s.id === row.lecture_session_id)
          : null
        const messages = userLectureQaRowToThread(row).messages
        return {
          lectureTitle: lec?.title ?? '(강좌)',
          subjectLabel: sub ? subjectLabel(sub) : '과목',
          instructor: row.instructor_name.trim() || lec?.instructor?.trim() || '',
          sessionTitle: ses?.title ?? null,
          contextKind: row.context_kind,
          contextAtSec: row.context_at_sec,
          ebookHighlightPage: row.ebook_highlight_page,
          messages,
        }
      })
      const threadsBlock = formatArchiveThreadsForPrompt(blocks)
      const subjectId = picked[0].subject_id
      const sub = subjectById.get(subjectId)
      const subjectLabelForPrompt = sub ? subjectLabel(sub) : '과목'
      const raw = await generateStudyQuestionsFromArchiveThreads({
        apiKey,
        count: questionCount,
        threadsBlock,
        subjectLabel: subjectLabelForPrompt,
      })
      const parsed = parseStudyArchiveQuestionsJson(raw)
      setGenQuestions(parsed.questions)

      const { error: perr, inserted } = await insertUserQaQuestionsFromArchive({
        userId,
        subjectId,
        sourceThreadIds: picked.map((r) => r.id),
        questions: parsed.questions,
      })
      if (perr) {
        setGenPersistErr(perr.message)
        setGenPersistOk(null)
      } else {
        setGenPersistErr(null)
        setGenPersistOk(
          inserted > 0
            ? `생성된 문항 ${inserted}개를 내 문제함에 저장했습니다.`
            : '저장할 문항이 없습니다.',
        )
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : '문항 생성에 실패했습니다.')
    } finally {
      setGenLoading(false)
    }
  }, [apiKey, archiveRows, selectedIds, questionCount, lectureById, subjectById, sessions, userId])

  const renderDrillNav = () => {
    if (load !== 'ok') return null

    if (!path.subjectId) {
      return (
        <Stack gap="xs">
        
          {navSubjects.length === 0 ? (
            <Text size="sm">저장된 Q&A가 없습니다. 인강/교재 학습에서 질문을 남겨 보세요.</Text>
          ) : (
            navSubjects.map((s) => (
              <Paper
                key={s.id}
                className="sa-drill-row"
                p="md"
                withBorder
                onClick={() => setPath({ ...emptyPath, subjectId: s.id })}
              >
                <Group justify="space-between">
                  <Text fw={600}>{subjectLabel(s)}</Text>
                  <Badge variant="light">{countThreadsForPath(archiveRows, { ...emptyPath, subjectId: s.id })}개</Badge>
                </Group>
              </Paper>
            ))
          )}
        </Stack>
      )
    }
    if (!path.instructor) {
      return (
        <Stack gap="xs">
          
          {navInstructorsForSubject.map((name) => (
            <Paper
              key={name}
              className="sa-drill-row"
              p="md"
              withBorder
              onClick={() => setPath({ ...path, instructor: name, lectureId: null, sessionFilter: null })}
            >
              <Group justify="space-between">
                <Text fw={600}>{name}</Text>
                <Badge variant="light">
                  {countThreadsForPath(archiveRows, {
                    ...emptyPath,
                    subjectId: path.subjectId,
                    instructor: name,
                    lectureId: null,
                    sessionFilter: null,
                  })}
                  개
                </Badge>
              </Group>
            </Paper>
          ))}
        </Stack>
      )
    }
    if (!path.lectureId) {
      return (
        <Stack gap="xs">
          
          {navLecturesForSubjectAndInstructor.map((L) => (
            <Paper
              key={L.id}
              className="sa-drill-row"
              p="md"
              withBorder
              onClick={() => setPath({ ...path, lectureId: L.id, sessionFilter: null })}
            >
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={600}>{L.title}</Text>
                  <Text size="xs" c="dimmed">
                    {subjectLabel(subjectById.get(L.subject_id)!)}
                  </Text>
                </div>
                <Badge variant="light">
                  {countThreadsForPath(archiveRows, {
                    subjectId: path.subjectId,
                    instructor: path.instructor,
                    lectureId: L.id,
                    sessionFilter: null,
                  })}
                  개
                </Badge>
              </Group>
            </Paper>
          ))}
        </Stack>
      )
    }
    if (!path.sessionFilter) {
      return (
        <Stack gap="xs">
       
          <Paper
            className="sa-drill-row"
            p="md"
            withBorder
            onClick={() => setPath({ ...path, sessionFilter: 'all' })}
          >
            <Group justify="space-between">
              <div>
                <Text fw={600}>전체 회차 · 교재 포함</Text>
                <Text size="xs" c="dimmed">
                  세션 없는 교재 대화 포함
                </Text>
              </div>
              <Badge variant="light">
                {countThreadsForPath(archiveRows, { ...path, sessionFilter: 'all' })}개
              </Badge>
            </Group>
          </Paper>
          {navSessionsForLecture.map((ses) => (
            <Paper
              key={ses.id}
              className="sa-drill-row"
              p="md"
              withBorder
              onClick={() => setPath({ ...path, sessionFilter: ses.id })}
            >
              <Group justify="space-between">
                <div>
                  <Text fw={600}>{ses.title}</Text>
                  <Text size="xs" c="dimmed">
                    회차 {ses.session_order + 1}
                  </Text>
                </div>
                <Badge variant="light">
                  {countThreadsForPath(archiveRows, { ...path, sessionFilter: ses.id })}개
                </Badge>
              </Group>
            </Paper>
          ))}
        </Stack>
      )
    }
    
  }

  return (
    <Box className="sa-page">
      <Stack gap="lg">
        <div>
          <Text size="sm" c="dimmed" mb={4}>
            Study room
          </Text>
          <Title order={2}>학습 아카이브</Title>
        </div>

        <Tabs
          value={archiveTab}
          onChange={(v) => {
            if (v === 'my-questions') setSearchParams({ tab: 'my-questions' })
            else setSearchParams({})
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="qa">Q&A 아카이브</Tabs.Tab>
            <Tabs.Tab value="my-questions">내가 만든 문제</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="my-questions" pt="lg">
            {load === 'ok' ? <StudyArchiveMyQuestionsTab subjects={subjects} /> : null}
            {load === 'loading' && (
              <Stack gap="sm">
                <Skeleton height={36} />
                <Skeleton height={120} />
              </Stack>
            )}
            {load === 'err' && (
              <Alert color="red" title="불러오기 실패">
                {errMsg}
              </Alert>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="qa" pt="lg">
        {load === 'err' && (
          <Alert color="red" title="불러오기 실패">
            {errMsg}
          </Alert>
        )}

        {load === 'loading' && (
          <Stack gap="sm">
            <Skeleton height={36} />
            <Skeleton height={220} />
          </Stack>
        )}

        {load === 'ok' && (
          <>
            <Group align="flex-start" gap="md" wrap="nowrap">
              <Paper withBorder p="md" radius="md" className="sa-nav-panel">
                <Text size="sm" fw={600} mb="sm">
                  뎁스
                </Text>
                <Breadcrumbs mb="md" separator="›">
                  {breadcrumbItems.map((b, i) =>
                    b.onClick ? (
                      <Button
                        key={`crumb-${i}-${b.label}`}
                        type="button"
                        variant="light"
                        color="teal"
                        size="compact-xs"
                        radius="md"
                        onClick={b.onClick}
                        styles={{ root: { cursor: 'pointer' } }}
                      >
                        {b.label}
                      </Button>
                    ) : (
                      <Button
                        key={`crumb-${i}-${b.label}`}
                        type="button"
                        variant="filled"
                        color="teal"
                        size="compact-xs"
                        radius="md"
                        tabIndex={-1}
                        styles={{
                          root: {
                            cursor: 'default',
                            pointerEvents: 'none',
                          },
                        }}
                      >
                        {b.label}
                      </Button>
                    ),
                  )}
                </Breadcrumbs>
                <ScrollArea h={380} type="auto">
                  {renderDrillNav()}
                </ScrollArea>
              </Paper>

              <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
                <Paper withBorder p="md" radius="md">
                  <Group justify="space-between" align="flex-end" wrap="wrap">
                    <div>
                      <Text size="sm" fw={600}>
                        대화 목록
                      </Text>
                     
                    </div>
                    <Group gap="xs">
                      <NumberInput
                        label="문항 수"
                        size="xs"
                        w={100}
                        min={1}
                        max={12}
                        value={questionCount}
                        onChange={(v) => setQuestionCount(typeof v === 'number' ? v : 5)}
                      />
                      <Button
                        size="sm"
                        variant="light"
                        onClick={selectAllVisible}
                        disabled={threadsAtStep.length === 0}
                      >
                        목록 전체 선택
                      </Button>
                      <Button size="sm" variant="default" onClick={clearSelection}>
                        선택 해제
                      </Button>
                      <Button
                        size="sm"
                        variant="light"
                        color="red"
                        onClick={openBulkDeleteModal}
                        disabled={selectedIds.size === 0}
                      >
                        선택 삭제 ({selectedIds.size})
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void runGenerate()}
                        disabled={selectedIds.size === 0}
                      >
                        선택 대화로 문항 생성
                      </Button>
                    </Group>
                  </Group>
                  {!apiKey && (
                    <Alert mt="sm" color="yellow" title="API 키">
                      VITE_GEMINI_API_KEY 가 없으면 문항 생성이 동작하지 않습니다.
                    </Alert>
                  )}

                  <Divider my="md" />

                  {threadsAtStep.length === 0 && (
                    <Text size="sm" c="dimmed">
                      이 조건에 해당하는 저장 대화가 없습니다.
                    </Text>
                  )}

                  {threadsAtStep.length > 0 && (
                    <ScrollArea h={420} type="auto">
                      <Table striped highlightOnHover withTableBorder>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th w={44} />
                            <Table.Th>미리보기</Table.Th>
                            <Table.Th>맥락</Table.Th>
                            <Table.Th>강좌</Table.Th>
                            <Table.Th>최근 활동</Table.Th>
                            <Table.Th w={80}>이동</Table.Th>
                            <Table.Th w={72}>삭제</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {threadsAtStep.map((row) => {
                            const lec = row.lectures ?? lectureById.get(row.lecture_id)
                            const ses = row.lecture_session_id
                              ? row.lecture_sessions ?? sessions.find((s) => s.id === row.lecture_session_id)
                              : null
                            const msgs = userLectureQaRowToThread(row).messages
                            const watchHref =
                              row.lecture_session_id && row.context_kind === 'video'
                                ? `/study/videos/watch/${row.lecture_session_id}?t=${Math.floor(row.context_at_sec)}`
                                : row.lecture_session_id
                                  ? `/study/videos/watch/${row.lecture_session_id}`
                                  : path.lectureId
                                    ? `/study/videos?lecture=${encodeURIComponent(path.lectureId)}`
                                    : '/study/videos'
                            return (
                              <Table.Tr key={row.id}>
                                <Table.Td>
                                  <Checkbox
                                    checked={selectedIds.has(row.id)}
                                    onChange={(e) => toggleSelect(row.id, e.currentTarget.checked)}
                                  />
                                </Table.Td>
                                <Table.Td>
                                  <Text size="sm" lineClamp={2}>
                                    {firstUserSnippet(msgs)}
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  <Group gap={6}>
                                    <Badge size="xs" variant="outline" color={row.context_kind === 'video' ? 'blue' : 'grape'}>
                                      {row.context_kind === 'video' ? '영상' : '교재'}
                                    </Badge>
                                    <Text size="xs" c="dimmed">
                                      {row.context_kind === 'video'
                                        ? formatTimestamp(row.context_at_sec)
                                        : row.ebook_highlight_page != null
                                          ? `p.${row.ebook_highlight_page}`
                                          : '—'}
                                    </Text>
                                  </Group>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="sm" lineClamp={1}>
                                    {lec?.title ?? '—'}
                                  </Text>
                                  <Text size="xs" c="dimmed" lineClamp={1}>
                                    {ses?.title ?? (row.lecture_session_id ? '회차' : '교재/세션 없음')}
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs" c="dimmed">
                                    {new Date(row.updated_at).toLocaleString('ko-KR')}
                                  </Text>
                                </Table.Td>
                                <Table.Td>
                                  <Tooltip label="해당 강의로 이동">
                                    <ActionIcon component={Link} to={watchHref} variant="light" size="sm" aria-label="강의로 이동">
                                      ↗
                                    </ActionIcon>
                                  </Tooltip>
                                </Table.Td>
                                <Table.Td>
                                  <Tooltip label="이 대화를 삭제">
                                    <ActionIcon
                                      type="button"
                                      color="red"
                                      variant="light"
                                      size="sm"
                                      aria-label="대화 삭제"
                                      onClick={() => openDeleteModal(row)}
                                    >
                                      🗑
                                    </ActionIcon>
                                  </Tooltip>
                                </Table.Td>
                              </Table.Tr>
                            )
                          })}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  )}
                </Paper>
              </Stack>
            </Group>
          </>
        )}
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <Modal
        opened={deleteModal !== null}
        onClose={() => {
          if (deleteLoading) return
          setDeleteModal(null)
          setDeleteError(null)
        }}
        title={deleteModal?.kind === 'bulk' ? '선택 대화 삭제' : '대화 삭제'}
        size={deleteModal?.kind === 'bulk' ? 'md' : 'sm'}
      >
        <Stack gap="md">
          <Text size="sm">
            {deleteModal?.kind === 'bulk' ? (
              <>
                선택한 <strong>{deleteModal.ids.length}개</strong> 대화를 삭제하시겠습니까? 삭제되면 복구할 수 없어요.
              </>
            ) : (
              <>
                이 대화를 삭제하시겠습니까? 삭제되면 복구할 수 없어요.
              </>
            )}
          </Text>
          {deleteModal?.kind === 'single' ? (
            <Paper withBorder p="sm" radius="sm">
              <Text size="sm" c="dimmed" lineClamp={3}>
                {deleteModal.preview}
              </Text>
            </Paper>
          ) : null}
          {deleteModal?.kind === 'bulk' ? (
            <Stack gap={6}>
              {deleteModal.ids.slice(0, 5).map((id) => {
                const row = archiveRows.find((r) => r.id === id)
                const prev = row
                  ? firstUserSnippet(userLectureQaRowToThread(row).messages, 72)
                  : '(알 수 없음)'
                return (
                  <Paper key={id} withBorder p="xs" radius="sm">
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {prev}
                    </Text>
                  </Paper>
                )
              })}
              {deleteModal.ids.length > 5 ? (
                <Text size="xs" c="dimmed">
                  외 {deleteModal.ids.length - 5}건
                </Text>
              ) : null}
            </Stack>
          ) : null}
          {deleteError ? (
            <Alert color="red" title="삭제 실패">
              {deleteError}
            </Alert>
          ) : null}
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={() => {
                setDeleteModal(null)
                setDeleteError(null)
              }}
              disabled={deleteLoading}
            >
              취소
            </Button>
            <Button color="red" loading={deleteLoading} onClick={() => void confirmDelete()}>
              {deleteModal?.kind === 'bulk' ? `${deleteModal.ids.length}개 삭제` : '삭제'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={genOpen}
        onClose={() => {
          setGenOpen(false)
          setGenError(null)
          setGenPersistErr(null)
          setGenPersistOk(null)
          setGenQuestions([])
        }}
        title="생성된 복습 문항"
        size="lg"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        {genLoading && <Text size="sm">Gemini가 문항을 작성하는 중입니다…</Text>}
        {genError && (
          <Alert color="red" title="오류">
            {genError}
          </Alert>
        )}
        {genPersistOk && (
          <Alert color="teal" title="저장">
            {genPersistOk}
          </Alert>
        )}
        {genPersistErr && (
          <Alert color="orange" title="DB 저장 실패">
            {genPersistErr}
          </Alert>
        )}
        {!genLoading && !genError && genQuestions.length === 0 && (
          <Text size="sm" c="dimmed">
            표시할 문항이 없습니다. JSON 파싱에 실패했을 수 있습니다.
          </Text>
        )}
        <Stack gap="md" mt="sm">
          {genQuestions.map((q, i) => (
            <Card key={i} withBorder padding="md" radius="md">
              <Group justify="space-between" mb={6}>
                <Group gap={6}>
                  <Badge variant="light">{kindLabel(q.kind)}</Badge>
                  {q.category_label ? (
                    <Badge variant="outline" color="gray">
                      {q.category_label}
                    </Badge>
                  ) : null}
                  {q.difficulty_level ? (
                    <Text size="xs" c="dimmed">
                      난이도 {q.difficulty_level}
                    </Text>
                  ) : null}
                  {q.estimated_time != null ? (
                    <Text size="xs" c="dimmed">
                      예상 {q.estimated_time}s
                    </Text>
                  ) : null}
                </Group>
                <Text size="xs" c="dimmed">
                  {i + 1} / {genQuestions.length}
                </Text>
              </Group>
              <Text size="sm" fw={600} mb={4}>
                {qaInstructionLine(q)}
              </Text>
              {q.content?.trim() ? (
                <Text size="sm" mb="xs">
                  {q.content}
                </Text>
              ) : null}
              {q.additional_passage?.trim() ? (
                <Paper withBorder p="sm" mb="sm" radius="sm">
                  <Text size="xs" c="dimmed" mb={4}>
                    추가 지문
                  </Text>
                  <Text size="sm">{q.additional_passage}</Text>
                </Paper>
              ) : null}
              {q.choices && q.choices.length > 0 && (
                <Stack gap={4} mb="sm">
                  {q.choices.map((c, j) => (
                    <Text key={j} size="sm">
                      {j + 1}. {c}
                    </Text>
                  ))}
                </Stack>
              )}
              <Text size="sm" c="teal.3">
                정답: {q.answer}
              </Text>
              {(q.explanation || q.hint) && (
                <Text size="xs" c="dimmed" mt={6}>
                  해설: {q.explanation ?? q.hint}
                </Text>
              )}
              {q.tags && q.tags.length > 0 && (
                <Group gap={6} mt={8}>
                  {q.tags.map((t, ti) => (
                    <Text key={`${i}-${ti}-${t}`} size="xs" c="dimmed">
                      {t}
                    </Text>
                  ))}
                </Group>
              )}
            </Card>
          ))}
        </Stack>
      </Modal>
    </Box>
  )
}
