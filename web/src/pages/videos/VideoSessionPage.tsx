import { Button, Drawer, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CaptionSearchPanel } from '../../features/lecture/CaptionSearchPanel'
import {
  EbookDrawerPanel,
  EbookPdfPageNav,
  type PdfReaderToolbarApi,
} from '../../features/lecture/EbookDrawer'
import {
  LectureQuestionPanel,
  type LectureQuestionThread,
} from '../../features/lecture/LectureQuestionModal'
import {
  SessionYouTubePlayer,
  type SessionPlayerHandle,
} from '../../features/lecture/SessionYouTubePlayer'
import { fetchLectureEbookSections } from '../../lib/lectureEbookSections'
import { formatTimestamp } from '../../lib/formatTime'
import { supabase } from '../../lib/supabase'
import type { LectureCaption, LectureEbookSection } from '../../types/lectures'
import './VideoSessionPage.css'

type SubEmb = { id: string; name: string; category: string | null }

/** PostgREST embed 는 1:1 이라도 배열로 올 수 있음 */
type LecEmbed = {
  id: string
  title: string
  instructor: string
  subjects: SubEmb | SubEmb[] | null
} | null

type SessionDetail = {
  id: string
  lecture_id: string
  session_order: number
  title: string
  youtube_video_id: string
  youtube_url: string | null
  total_duration_sec: number | null
  thumbnail_url: string | null
  caption: boolean
  lectures: LecEmbed | LecEmbed[]
}

function firstRel<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

export function VideoSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [searchParams] = useSearchParams()
  const deepSeekRaw = searchParams.get('t')
  const initialSeekSec =
    deepSeekRaw != null && deepSeekRaw !== ''
      ? (() => {
          const n = Number(deepSeekRaw)
          return Number.isFinite(n) && n >= 0 ? n : null
        })()
      : null
  const deepOpenEbook = searchParams.get('ebook') === '1'
  const deepResourceId = searchParams.get('resourceId')?.trim() || null
  const deepPageRaw = searchParams.get('page')
  const deepPdfPage =
    deepPageRaw != null && deepPageRaw !== ''
      ? (() => {
          const n = Math.floor(Number(deepPageRaw))
          return Number.isFinite(n) && n >= 1 ? n : null
        })()
      : null

  const playerRef = useRef<SessionPlayerHandle>(null)
  const rafRef = useRef<number | null>(null)
  const [captionSearchOpen, { open: openCaptionSearch, close: closeCaptionSearch }] =
    useDisclosure(false)
  const [questionOpen, { open: openQuestion, close: closeQuestion }] = useDisclosure(false)

  const [load, setLoad] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [captions, setCaptions] = useState<LectureCaption[]>([])

  const [currentSec, setCurrentSec] = useState(0)
  const [durationSec, setDurationSec] = useState(0)
  const [playing, setPlaying] = useState(false)

  const [questionThreads, setQuestionThreads] = useState<LectureQuestionThread[]>([])
  const [activeQuestionThreadId, setActiveQuestionThreadId] = useState<string | null>(null)
  const [ebookOpen, setEbookOpen] = useState(false)
  const [ebookPdfToolbar, setEbookPdfToolbar] = useState<PdfReaderToolbarApi | null>(null)
  const [ebookSections, setEbookSections] = useState<LectureEbookSection[]>([])
  const [lecturePdfRefs, setLecturePdfRefs] = useState<{ pdf_url: string; title: string | null }[]>([])

  const activeCaption = useMemo(() => {
    return (
      captions.find((x) => currentSec >= x.start_sec && currentSec < x.end_sec) ??
      captions.find((x) => currentSec >= x.start_sec && currentSec <= x.end_sec) ??
      null
    )
  }, [captions, currentSec])

  const bumpUi = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    setCurrentSec(p.getCurrentTime())
    setDurationSec(p.getDuration())
    setPlaying(p.getIsPlaying())
  }, [])

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    setLoad('loading')
    setErrMsg(null)
    setEbookSections([])
    setLecturePdfRefs([])

    void (async () => {
      const { data, error } = await supabase
        .from('lecture_sessions')
        .select(
          `
          id,
          lecture_id,
          session_order,
          title,
          youtube_video_id,
          youtube_url,
          total_duration_sec,
          thumbnail_url,
          caption,
          lectures (
            id,
            title,
            instructor,
            subjects ( id, name, category )
          )
        `,
        )
        .eq('id', sessionId)
        .single()

      if (cancelled) return
      if (error || !data) {
        setLoad('err')
        setErrMsg(error?.message ?? '세션을 찾을 수 없습니다.')
        return
      }

      setSession(data as SessionDetail)

      const lectureId = data.lecture_id as string
      const [cap, sections, pdfRes] = await Promise.all([
        supabase
          .from('lecture_captions')
          .select('id,lecture_session_id,start_sec,end_sec,text,language')
          .eq('lecture_session_id', sessionId)
          .order('start_sec'),
        fetchLectureEbookSections(supabase, lectureId),
        supabase.from('learning_resources').select('pdf_url,title').eq('lecture_id', lectureId).order('id'),
      ])

      if (cancelled) return
      if (!cancelled) {
        setEbookSections(sections)
        const prow = (pdfRes.data ?? []) as { pdf_url?: string; title?: string | null }[]
        setLecturePdfRefs(
          prow
            .filter((r) => String(r.pdf_url ?? '').trim().length > 0)
            .map((r) => ({
              pdf_url: String(r.pdf_url).trim(),
              title: r.title ?? null,
            })),
        )
      }

      if (cap.error) {
        setLoad('err')
        setErrMsg(cap.error.message)
        return
      }

      setCaptions((cap.data ?? []) as LectureCaption[])
      setLoad('ok')
    })()

    return () => {
      cancelled = true
    }
  }, [sessionId])

  const deepEbookOpenedRef = useRef(false)
  useEffect(() => {
    deepEbookOpenedRef.current = false
  }, [sessionId])

  useEffect(() => {
    if (load !== 'ok' || !deepOpenEbook || deepEbookOpenedRef.current) return
    deepEbookOpenedRef.current = true
    setEbookOpen(true)
  }, [load, deepOpenEbook])

  useEffect(() => {
    setQuestionThreads([])
    setActiveQuestionThreadId(null)
  }, [sessionId])

  useEffect(() => {
    const tick = () => {
      bumpUi()
      rafRef.current = window.requestAnimationFrame(tick)
    }
    rafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [bumpUi])

  if (!sessionId) {
    return <p className="vs-err">잘못된 경로입니다.</p>
  }

  if (load === 'loading' || load === 'idle') {
    return <p className="vs-muted">불러오는 중…</p>
  }

  if (load === 'err' || !session) {
    return (
      <div className="vs-errbox">
        <p className="vs-err">{errMsg}</p>
        <Link className="vs-back" to="/study/videos">
          강의 목록으로
        </Link>
      </div>
    )
  }

  const lec = firstRel(session.lectures)
  const subject = lec ? firstRel(lec.subjects) : null
  const dur = durationSec > 0 ? durationSec : session.total_duration_sec ?? 0
  const progress = dur > 0 ? Math.min(100, (currentSec / dur) * 100) : 0

  function handleSeek(sec: number) {
    playerRef.current?.seekTo(sec)
    bumpUi()
  }

  function handleQuestionClick() {
    const t = playerRef.current?.getCurrentTime() ?? 0
    const id = crypto.randomUUID()
    setQuestionThreads((prev) => [{ id, contextAtSec: t, contextKind: 'video', messages: [] }, ...prev])
    setActiveQuestionThreadId(id)
    openQuestion()
    bumpUi()
  }

  function handleOpenQuestionFromCaptionSearch(startSec: number) {
    handleSeek(startSec)
    const id = crypto.randomUUID()
    setQuestionThreads((prev) => [
      { id, contextAtSec: startSec, contextKind: 'video', messages: [] },
      ...prev,
    ])
    setActiveQuestionThreadId(id)
    closeCaptionSearch()
    openQuestion()
  }

  function handleOpenQuestionFromPdfSelection(selectedText: string, pdfUrl: string, highlightPage: number) {
    const t = playerRef.current?.getCurrentTime() ?? 0
    const id = crypto.randomUUID()
    setQuestionThreads((prev) => [
      {
        id,
        contextAtSec: t,
        contextKind: 'ebook',
        ebookHighlight: selectedText,
        ebookHighlightPage: highlightPage,
        ebookPdfUrl: pdfUrl,
        messages: [],
        seedDraft: selectedText,
      },
      ...prev,
    ])
    setActiveQuestionThreadId(id)
    setEbookOpen(false)
    setEbookPdfToolbar(null)
    openQuestion()
  }

  function closeEbookDrawer() {
    setEbookOpen(false)
    setEbookPdfToolbar(null)
  }

  return (
    <div className="vs">
      <nav className="vs-crumb" aria-label="breadcrumb">
        <Link to="/study/videos">강의 목록</Link>
        <span className="vs-crumb__sep">/</span>
        <span>{subject?.name ?? '과목'}</span>
        <span className="vs-crumb__sep">/</span>
        <span>{lec?.title ?? '강좌'}</span>
        <span className="vs-crumb__sep">/</span>
        <span className="vs-crumb__here">
          {session.session_order}강 · {session.title}
        </span>
      </nav>

      <div className="vs-player-stack">
        <SessionYouTubePlayer
          ref={playerRef}
          videoId={session.youtube_video_id}
          onPlayerStateChange={bumpUi}
          initialSeekSec={initialSeekSec}
        />

        <Paper
          className="vs-live-caption"
          withBorder
          radius="md"
          p="md"
          aria-live="polite"
          aria-label="현재 재생 구간 자막"
        >
          <Group align="flex-start" justify="space-between" gap="md" wrap="wrap">
            <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
              {activeCaption ? (
                <>
                  <Text className="vs-live-caption__body" size="md" lh={1.65}>
                    {activeCaption.text}
                  </Text>
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  {session.caption
                    ? '이 시점에 해당하는 자막 구간이 없습니다.'
                    : '이 회차에는 등록된 자막이 없습니다.'}
                </Text>
              )}
            </Stack>
            <Button
              variant="filled"
              color="teal"
              size="sm"
              style={{ flexShrink: 0 }}
              onClick={handleQuestionClick}
            >
              질문하기
            </Button>
          </Group>
        </Paper>

        <div className="vs-controls">
          <div className="vs-controls__row">
            <button
              type="button"
              className="vs-btn vs-btn--icon"
              aria-label={playing ? '일시정지' : '재생'}
              onClick={() => {
                playerRef.current?.togglePlay()
                bumpUi()
              }}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <span className="vs-time">
              {formatTimestamp(currentSec)} / {dur > 0 ? formatTimestamp(dur) : '—'}
            </span>
            <Button variant="light" color="teal" size="compact-sm" onClick={openCaptionSearch}>
              자막 검색
            </Button>
            <button
              type="button"
              className="vs-btn vs-btn--ghost"
              onClick={() =>
                setEbookOpen((o) => {
                  if (o) setEbookPdfToolbar(null)
                  return !o
                })
              }
            >
              {ebookOpen ? '교재 닫기' : '교재 보기'}
            </button>
          </div>
          <label className="vs-progress">
            <span className="vs-sr-only">재생 위치</span>
            <input
              type="range"
              min={0}
              max={Math.max(dur, 0.001)}
              step={0.1}
              value={Math.min(currentSec, dur || 0)}
              onChange={(e) => handleSeek(Number(e.target.value))}
            />
            <div className="vs-progress__fill" style={{ width: `${progress}%` }} />
          </label>
        </div>
      </div>

      <Drawer
        opened={captionSearchOpen}
        onClose={closeCaptionSearch}
        title="자막 검색"
        position="right"
        size="md"
        zIndex={400}
        overlayProps={{ opacity: 0.35 }}
      >
        <ScrollArea h="calc(100dvh - 7rem)" type="auto" offsetScrollbars>
          <CaptionSearchPanel
            variant="drawer"
            captions={captions}
            onSeek={handleSeek}
            activeStartSec={activeCaption?.start_sec ?? null}
            onOpenQuestionAtSec={handleOpenQuestionFromCaptionSearch}
          />
        </ScrollArea>
      </Drawer>

      <Drawer
        opened={questionOpen}
        onClose={closeQuestion}
        title="질문하기"
        position="right"
        size="md"
        zIndex={400}
        overlayProps={{ opacity: 0.35 }}
        styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
      >
        <LectureQuestionPanel
          opened={questionOpen}
          onClose={closeQuestion}
          threads={questionThreads}
          setThreads={setQuestionThreads}
          activeThreadId={activeQuestionThreadId}
          setActiveThreadId={setActiveQuestionThreadId}
          lectureTitle={lec?.title ?? '강좌'}
          sessionTitle={`${session.session_order}강 · ${session.title}`}
          instructor={lec?.instructor}
          subjectName={subject?.name ?? undefined}
          captions={captions}
          ebookSections={ebookSections}
          lecturePdfRefs={lecturePdfRefs}
        />
      </Drawer>

      <Drawer
        opened={ebookOpen}
        onClose={closeEbookDrawer}
        title={
          <Group justify="space-between" align="center" gap="sm" wrap="nowrap" w="100%">
            <Text component="span" size="md" fw={600} lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
              {`연결 교재 · ${lec?.title ?? '강좌'}`}
            </Text>
            {ebookPdfToolbar ? <EbookPdfPageNav api={ebookPdfToolbar} /> : null}
          </Group>
        }
        styles={{ title: { width: '100%', marginRight: 0 } }}
        position="right"
        size="min(920px, 96vw)"
        zIndex={400}
        overlayProps={{ opacity: 0.35 }}
      >
        <ScrollArea h="calc(100dvh - 7rem)" type="auto" offsetScrollbars>
          <EbookDrawerPanel
            lectureId={session.lecture_id ?? lec?.id ?? ''}
            onOpenQuestionFromSelection={handleOpenQuestionFromPdfSelection}
            onPdfToolbar={setEbookPdfToolbar}
            initialResourceId={deepResourceId}
            initialPdfPage={deepPdfPage}
          />
        </ScrollArea>
      </Drawer>
    </div>
  )
}
