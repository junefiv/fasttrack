import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Image,
  Paper,
  Skeleton,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Lecture, LectureSession, Subject } from '../../types/lectures'
import { formatTimestamp } from '../../lib/formatTime'
import './VideosBrowsePage.css'

type LoadState = { status: 'idle' | 'loading' | 'ok' | 'err'; message?: string }

type DrillStep = 'instructors' | 'lectures' | 'sessions'

function ytThumb(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}

function uniqueInstructorsForSubject(lectures: Lecture[], subjectId: string): string[] {
  const set = new Set<string>()
  for (const l of lectures) {
    if (l.subject_id === subjectId) set.add(l.instructor.trim() || '이름 없음')
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
}

/** instructor 표시용 키와 DB 값 매칭: '이름 없음' ↔ 빈 문자열 */
function matchInstructorField(lecture: Lecture, instructorKey: string): boolean {
  const name = lecture.instructor.trim() || '이름 없음'
  return name === instructorKey
}

export function VideosBrowsePage() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [sessions, setSessions] = useState<LectureSession[]>([])
  const [capCountBySession, setCapCountBySession] = useState<Map<string, number>>(new Map())
  const [load, setLoad] = useState<LoadState>({ status: 'idle' })

  const [subjectTab, setSubjectTab] = useState<string | null>(null)
  const [drillStep, setDrillStep] = useState<DrillStep>('instructors')
  const [selectedInstructor, setSelectedInstructor] = useState<string | null>(null)
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })

    void (async () => {
      const [subRes, lecRes, sesRes, capRes] = await Promise.all([
        supabase.from('subjects').select('id,name,category').order('name'),
        supabase.from('lectures').select('id,subject_id,instructor,title,series_description').order('title'),
        supabase
          .from('lecture_sessions')
          .select(
            'id,lecture_id,session_order,title,youtube_video_id,thumbnail_url,total_duration_sec,youtube_url,caption',
          )
          .order('session_order'),
        supabase.from('lecture_captions').select('lecture_session_id'),
      ])

      if (cancelled) return

      if (subRes.error || lecRes.error || sesRes.error) {
        const msg = subRes.error?.message ?? lecRes.error?.message ?? sesRes.error?.message
        setLoad({ status: 'err', message: msg ?? '데이터를 불러오지 못했습니다.' })
        return
      }

      const counts = new Map<string, number>()
      if (!capRes.error && capRes.data) {
        for (const row of capRes.data as { lecture_session_id: string }[]) {
          const id = row.lecture_session_id
          counts.set(id, (counts.get(id) ?? 0) + 1)
        }
      }

      const subj = (subRes.data ?? []) as Subject[]
      setSubjects(subj)
      setLectures((lecRes.data ?? []) as Lecture[])
      setSessions((sesRes.data ?? []) as LectureSession[])
      setCapCountBySession(counts)
      setLoad({ status: 'ok' })
      if (subj.length && subjectTab === null) {
        setSubjectTab(subj[0].id)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const sesByLecture = useMemo(() => {
    const m = new Map<string, LectureSession[]>()
    for (const s of sessions) {
      const arr = m.get(s.lecture_id) ?? []
      arr.push(s)
      m.set(s.lecture_id, arr)
    }
    return m
  }, [sessions])

  const onSubjectTabChange = (value: string | null) => {
    setSubjectTab(value)
    setDrillStep('instructors')
    setSelectedInstructor(null)
    setSelectedLectureId(null)
  }

  const catalogEmpty =
    load.status === 'ok' &&
    subjects.length === 0 &&
    lectures.length === 0 &&
    sessions.length === 0

  const activeSubject = subjects.find((s) => s.id === subjectTab) ?? null

  const instructorsInTab = useMemo(() => {
    if (!subjectTab) return []
    return uniqueInstructorsForSubject(lectures, subjectTab)
  }, [lectures, subjectTab])

  const lecturesInDrill = useMemo(() => {
    if (!subjectTab || !selectedInstructor) return []
    return lectures.filter(
      (l) => l.subject_id === subjectTab && matchInstructorField(l, selectedInstructor),
    ).sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  }, [lectures, subjectTab, selectedInstructor])

  const selectedLecture = useMemo(
    () => lectures.find((l) => l.id === selectedLectureId) ?? null,
    [lectures, selectedLectureId],
  )

  const sessionsInDrill = selectedLectureId ? (sesByLecture.get(selectedLectureId) ?? []) : []

  if (load.status === 'loading' || load.status === 'idle') {
    return (
      <Stack gap="md" maw={960} mx="auto" py="md" px="sm">
        <Skeleton height={28} width="40%" />
        <Skeleton height={16} width="70%" />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </Stack>
    )
  }

  if (load.status === 'err') {
    return (
      <Stack gap="md" maw={960} mx="auto" py="md" px="sm">
        <Alert color="red" title="불러오기 실패">
          {load.message}
        </Alert>
        <Text size="sm" c="dimmed">
          <Code>VITE_SUPABASE_URL</Code>, <Code>VITE_SUPABASE_ANON_KEY</Code> 와 네트워크를 확인하세요.
        </Text>
      </Stack>
    )
  }

  return (
    <Stack gap="lg" maw={960} mx="auto" py="md" px="sm" className="vb-page">
      <Stack gap="xs">
        <Title order={1} size="h2">
          강의 목록
        </Title>
        
      </Stack>

      {subjects.length === 0 && !catalogEmpty ? (
        <Text c="dimmed">등록된 과목이 없습니다.</Text>
      ) : subjects.length === 0 ? null : (
        <Tabs value={subjectTab ?? undefined} onChange={onSubjectTabChange}>
          <Tabs.List grow>
            {subjects.map((s) => (
              <Tabs.Tab key={s.id} value={s.id}>
                {s.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          {subjects.map((s) => (
            <Tabs.Panel key={s.id} value={s.id} pt="md">
              {subjectTab !== s.id ? null : (
                <Stack gap="md">
                  {drillStep === 'sessions' && selectedLecture && selectedInstructor ? (
                    <>
                      <Group gap="xs">
                        <Button
                          variant="subtle"
                          size="compact-sm"
                          onClick={() => {
                            setDrillStep('lectures')
                            setSelectedLectureId(null)
                          }}
                        >
                          ← 강좌 목록
                        </Button>
                      </Group>
                      <Paper withBorder p="md" radius="md">
                        <Stack gap={4}>
                          <Text size="sm" c="dimmed">
                            {activeSubject?.name} · {selectedInstructor}
                          </Text>
                          <Title order={3} size="h4">
                            {selectedLecture.title}
                          </Title>
                          <Text size="sm" c="dimmed">
                            회차 {sessionsInDrill.length}개
                          </Text>
                        </Stack>
                      </Paper>
                      {sessionsInDrill.length === 0 ? (
                        <Text size="sm" c="dimmed">
                          등록된 회차가 없습니다.
                        </Text>
                      ) : (
                        <Stack gap="xs">
                          {sessionsInDrill.map((session) => {
                            const caps = capCountBySession.get(session.id) ?? 0
                            const thumb = session.thumbnail_url ?? ytThumb(session.youtube_video_id)
                            return (
                              <Paper
                                key={session.id}
                                component={Link}
                                to={`/videos/watch/${session.id}`}
                                className="vb-session-row"
                                withBorder
                                p="sm"
                                radius="md"
                              >
                                <Group wrap="nowrap" align="flex-start" gap="sm">
                                  <Image
                                    src={thumb}
                                    alt=""
                                    w={100}
                                    h={56}
                                    radius="sm"
                                    fit="cover"
                                    className="vb-session-thumb"
                                  />
                                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                                    <Group gap="xs" wrap="wrap">
                                      <Badge color="teal" variant="light" size="sm">
                                        {session.session_order}강
                                      </Badge>
                                            {session.caption ? (
                                        <Badge variant="outline" color="gray" size="sm">
                                          자막 {caps}구간
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" color="gray" size="sm">
                                          자막 없음
                                        </Badge>
                                      )}
                                    </Group>
                                    <Text fw={600} lineClamp={2}>
                                      {session.title}
                                    </Text>
                                    <Group gap="md">
                                      <Text size="xs" c="dimmed" ff="monospace">
                                        {session.total_duration_sec != null
                                          ? formatTimestamp(session.total_duration_sec)
                                          : '길이 미등록'}
                                      </Text>
                                      <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>
                                        {session.youtube_video_id}
                                      </Text>
                                    </Group>
                                  </Stack>
                                </Group>
                              </Paper>
                            )
                          })}
                        </Stack>
                      )}
                    </>
                  ) : drillStep === 'lectures' && selectedInstructor ? (
                    <>
                      <Group gap="xs">
                        <Button
                          variant="subtle"
                          size="compact-sm"
                          onClick={() => {
                            setDrillStep('instructors')
                            setSelectedInstructor(null)
                            setSelectedLectureId(null)
                          }}
                        >
                          ← 선생님 목록
                        </Button>
                      </Group>
                      <Text size="sm" c="dimmed">
                        {activeSubject?.name} · <strong>{selectedInstructor}</strong> 강좌
                      </Text>
                      {lecturesInDrill.length === 0 ? (
                        <Text size="sm" c="dimmed">
                          이 선생님의 강좌가 없습니다.
                        </Text>
                      ) : (
                        <Stack gap="xs">
                          {lecturesInDrill.map((lec) => {
                            const ses = sesByLecture.get(lec.id) ?? []
                            return (
                              <Paper
                                key={lec.id}
                                className="vb-drill-row"
                                withBorder
                                p="md"
                                radius="md"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setSelectedLectureId(lec.id)
                                  setDrillStep('sessions')
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setSelectedLectureId(lec.id)
                                    setDrillStep('sessions')
                                  }
                                }}
                              >
                                <Group justify="space-between" wrap="nowrap" align="flex-start">
                                  <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                                    <Text fw={700} lineClamp={2}>
                                      {lec.title}
                                    </Text>
                                    {lec.series_description ? (
                                      <Text size="sm" c="dimmed" lineClamp={2}>
                                        {lec.series_description}
                                      </Text>
                                    ) : null}
                                  </Stack>
                                  <Badge variant="light" color="gray" size="sm">
                                    회차 {ses.length}
                                  </Badge>
                                </Group>
                              </Paper>
                            )
                          })}
                        </Stack>
                      )}
                    </>
                  ) : (
                    <>
                      <Text size="sm" c="dimmed">
                        선생님을 선택하면 해당 과목의 강좌 목록으로
                        들어갑니다.
                      </Text>
                      {instructorsInTab.length === 0 ? (
                        <Text size="sm" c="dimmed">
                          이 과목에 등록된 선생님이 없습니다.
                        </Text>
                      ) : (
                        <Stack gap="xs">
                          {instructorsInTab.map((name) => {
                            const count = lectures.filter(
                              (l) => l.subject_id === s.id && matchInstructorField(l, name),
                            ).length
                            return (
                              <Paper
                                key={name}
                                className="vb-drill-row"
                                withBorder
                                p="md"
                                radius="md"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setSelectedInstructor(name)
                                  setDrillStep('lectures')
                                  setSelectedLectureId(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setSelectedInstructor(name)
                                    setDrillStep('lectures')
                                    setSelectedLectureId(null)
                                  }
                                }}
                              >
                                <Group justify="space-between" wrap="nowrap">
                                  <Text fw={700}>{name}</Text>
                                  <Badge variant="light" color="teal">
                                    강좌 {count}
                                  </Badge>
                                </Group>
                              </Paper>
                            )
                          })}
                        </Stack>
                      )}
                    </>
                  )}
                </Stack>
              )}
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
    </Stack>
  )
}
