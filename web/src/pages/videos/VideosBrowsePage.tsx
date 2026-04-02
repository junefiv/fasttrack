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
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Lecture, LectureSession, Subject } from '../../types/lectures'
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
  const [searchParams] = useSearchParams()
  const deepLectureId = searchParams.get('lecture')?.trim() ?? ''
  const deepLinkAppliedFor = useRef<string>('')

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [sessions, setSessions] = useState<LectureSession[]>([])
  const [load, setLoad] = useState<LoadState>({ status: 'idle' })

  const [subjectTab, setSubjectTab] = useState<string | null>(null)
  const [drillStep, setDrillStep] = useState<DrillStep>('instructors')
  const [selectedInstructor, setSelectedInstructor] = useState<string | null>(null)
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })

    void (async () => {
      const [subRes, lecRes, sesRes] = await Promise.all([
        supabase.from('subjects').select('id,name,category').order('name'),
        supabase.from('lectures').select('id,subject_id,instructor,title,series_description').order('title'),
        supabase
          .from('lecture_sessions')
          .select('id,lecture_id,title,youtube_video_id,thumbnail_url')
          .order('session_order'),
      ])

      if (cancelled) return

      if (subRes.error || lecRes.error || sesRes.error) {
        const msg = subRes.error?.message ?? lecRes.error?.message ?? sesRes.error?.message
        setLoad({ status: 'err', message: msg ?? '데이터를 불러오지 못했습니다.' })
        return
      }

      const subj = (subRes.data ?? []) as Subject[]
      setSubjects(subj)
      setLectures((lecRes.data ?? []) as Lecture[])
      setSessions((sesRes.data ?? []) as LectureSession[])
      setLoad({ status: 'ok' })
      if (subj.length && subjectTab === null) {
        setSubjectTab(subj[0].id)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    deepLinkAppliedFor.current = ''
  }, [deepLectureId])

  useEffect(() => {
    if (load.status !== 'ok' || !deepLectureId) return
    if (deepLinkAppliedFor.current === deepLectureId) return
    const lec = lectures.find((l) => l.id === deepLectureId)
    if (!lec) return
    deepLinkAppliedFor.current = deepLectureId
    const instructorKey = lec.instructor.trim() || '이름 없음'
    setSubjectTab(lec.subject_id)
    setSelectedInstructor(instructorKey)
    setSelectedLectureId(lec.id)
    setDrillStep('sessions')
  }, [load.status, deepLectureId, lectures])

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
                            const thumb = session.thumbnail_url ?? ytThumb(session.youtube_video_id)
                            return (
                              <Paper
                                key={session.id}
                                component={Link}
                                to={`/study/videos/watch/${session.id}`}
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
                                    <Text fw={600} lineClamp={2}>
                                      {session.title}
                                    </Text>
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
