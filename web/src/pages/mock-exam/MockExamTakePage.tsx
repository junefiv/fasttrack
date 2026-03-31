import { Button, Drawer } from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ProblemRenderer } from '../../components/ProblemRenderer'
import { ReadingBodyDiagrams } from '../../components/ReadingBodyDiagrams'
import { renderExamRichText } from '../../lib/richExamText'
import { getFasttrackUserId } from '../../lib/fasttrackUser'
import {
  fetchCatalogProblemsForTake,
  fetchMockExam,
  fetchMockExamCatalogById,
  fetchProblemsForExam,
  submitMockSession,
} from '../../lib/fasttrackQueries'
import { buildCatalogPreviewExamMeta, buildCatalogPreviewProblems } from '../../lib/mockExamPreview'
import { upsertStudentStatsAfterSession } from '../../lib/fasttrackStats'
import type { FasttrackProblemRow } from '../../types/fasttrack'
import './MockExamTakePage.css'

/**
 * 응시 UI 정규화.
 * 카탈로그: reading_body=본문(content), passage=지문(additional_passage), instruction=발문.
 * 연동 시험(fasttrack_problems): reading_body 없음, passage=지문·문항 통합 블록.
 */
type MockTakeSheetProblem = {
  id: string
  question_number: number
  instruction: string | null
  reading_body: string | null
  diagram: string | null
  diagram_url: string | null
  passage: string | null
  options: unknown
  correct_answer: string
  examRow?: FasttrackProblemRow
}

function mapCatalogRowToSheet(r: {
  problem_id: string
  question_number: number
  instruction: string | null
  content: string | null
  additional_passage: string | null
  diagram: string | null
  diagram_url: string | null
  options: unknown
  answer: number
}): MockTakeSheetProblem {
  const rb = r.content?.trim() ? r.content : null
  const ap = r.additional_passage?.trim() ? r.additional_passage : null
  const dg = r.diagram?.trim() ? r.diagram : null
  const du = r.diagram_url?.trim() ? r.diagram_url : null
  return {
    id: r.problem_id,
    question_number: r.question_number,
    instruction: r.instruction,
    reading_body: rb,
    diagram: dg,
    diagram_url: du,
    passage: ap,
    options: r.options,
    correct_answer: String(r.answer),
  }
}

function mapExamRowToSheet(p: FasttrackProblemRow): MockTakeSheetProblem {
  const merged = [p.passage, p.question_text].filter(Boolean).join('\n\n').trim()
  const dg = p.diagram?.trim() ? p.diagram : null
  const du = p.diagram_url?.trim() ? p.diagram_url : null
  return {
    id: p.id,
    question_number: p.problem_number != null && p.problem_number > 0 ? p.problem_number : 0,
    instruction: p.instruction_text ?? null,
    reading_body: null,
    diagram: dg,
    diagram_url: du,
    passage: merged.length > 0 ? merged : null,
    options: p.choices,
    correct_answer: p.correct_answer,
    examRow: p,
  }
}

/** 미리보기: 지문(passage)과 문항(question_text)이 모두 있으면 본문/발문·지문 분할 예시 */
function mapPreviewStubToSheet(p: FasttrackProblemRow): MockTakeSheetProblem {
  const hasSplit = Boolean(p.passage?.trim()) && Boolean(p.question_text?.trim())
  const passageMerged = hasSplit
    ? [p.reference_view, p.question_text].filter(Boolean).join('\n\n').trim()
    : [p.passage, p.question_text].filter(Boolean).join('\n\n').trim()
  return {
    id: p.id,
    question_number: p.problem_number != null && p.problem_number > 0 ? p.problem_number : 0,
    instruction: p.instruction_text ?? null,
    reading_body: hasSplit ? p.passage ?? null : null,
    diagram: null,
    diagram_url: null,
    passage: passageMerged.length > 0 ? passageMerged : null,
    options: p.choices,
    correct_answer: p.correct_answer,
  }
}

function readingBodyKey(body: string | null | undefined): string {
  return (body ?? '').trim()
}

function problemHasReadingPanel(p: MockTakeSheetProblem | undefined): boolean {
  if (!p) return false
  return Boolean(
    p.reading_body?.trim() || p.diagram?.trim() || p.diagram_url?.trim(),
  )
}

export function MockExamTakePage() {
  const { examId, catalogId } = useParams<{ examId?: string; catalogId?: string }>()
  const navigate = useNavigate()
  const userId = getFasttrackUserId()
  const isPreviewMode = Boolean(catalogId)

  const [examName, setExamName] = useState('')
  const [problems, setProblems] = useState<MockTakeSheetProblem[]>([])
  const [previewFromCatalogDb, setPreviewFromCatalogDb] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})
  const [started] = useState(() => Date.now())
  const [remainSec, setRemainSec] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const finishRef = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    setPreviewFromCatalogDb(false)
    setIdx(0)
    setAnswers({})
    setFlagged({})
    ;(async () => {
      try {
        if (isPreviewMode && catalogId) {
          const cat = await fetchMockExamCatalogById(catalogId)
          if (cancelled) return
          if (!cat) {
            setErr('카탈로그에서 이 시리즈를 찾을 수 없습니다.')
            setLoading(false)
            return
          }
          const meta = buildCatalogPreviewExamMeta(cat)
          const catalogRows = await fetchCatalogProblemsForTake(catalogId)
          if (cancelled) return
          if (catalogRows.length > 0) {
            setExamName(cat.title)
            setRemainSec(meta.time_limit_min * 60)
            setProblems(catalogRows.map(mapCatalogRowToSheet))
            setPreviewFromCatalogDb(true)
          } else {
            setExamName(meta.name)
            setRemainSec(meta.time_limit_min * 60)
            setProblems(buildCatalogPreviewProblems(cat).map(mapPreviewStubToSheet))
            setPreviewFromCatalogDb(false)
          }
          setLoading(false)
          return
        }

        if (!examId) {
          if (!cancelled) {
            setErr('시험 ID가 없습니다.')
            setLoading(false)
          }
          return
        }

        const ex = await fetchMockExam(examId)
        const pr = await fetchProblemsForExam(examId)
        if (cancelled) return
        if (!ex) {
          setErr('시험을 찾을 수 없습니다.')
          setLoading(false)
          return
        }
        setExamName(ex.name)
        setRemainSec(ex.time_limit_min * 60)
        setProblems(pr.map(mapExamRowToSheet))
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '로드 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [examId, catalogId, isPreviewMode])

  useEffect(() => {
    if (loading) return
    const t = window.setInterval(() => {
      setRemainSec((s) => {
        if (s <= 1) {
          window.clearInterval(t)
          queueMicrotask(() => finishRef.current())
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(t)
  }, [loading])

  const current = problems[idx]
  const isNarrow = useMediaQuery('(max-width: 960px)')
  const [readingDrawerOpen, { open: openReadingDrawer, close: closeReadingDrawer }] = useDisclosure(false)
  const hasReadingPanel = problemHasReadingPanel(current)
  const showReadingAside = hasReadingPanel && !isNarrow

  const passageGroupStarts = useMemo(
    () =>
      problems.map((p, i) => {
        const k = readingBodyKey(p.reading_body)
        if (!k) return false
        if (i === 0) return true
        return readingBodyKey(problems[i - 1].reading_body) !== k
      }),
    [problems],
  )

  useEffect(() => {
    closeReadingDrawer()
  }, [idx, closeReadingDrawer])

  const fmt = useCallback((sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [])

  const finish = useCallback(async () => {
    if (submitting || problems.length === 0) return

    if (isPreviewMode) {
      navigate('/study/mock-exam')
      return
    }

    setSubmitting(true)
    try {
      const timeSpentSec = Math.max(0, Math.floor((Date.now() - started) / 1000))
      const examRows = problems.map((p) => p.examRow).filter(Boolean) as FasttrackProblemRow[]
      const { resultId } = await submitMockSession({
        userId,
        mockExamId: examId!,
        timeSpentSec,
        problemRows: examRows,
        answers,
      })
      const statsPayload = examRows.map((p) => ({
        problem: p,
        is_correct: (answers[p.id] ?? '').trim() === String(p.correct_answer).trim(),
      }))
      await upsertStudentStatsAfterSession(userId, statsPayload)
      navigate(`/study/mock-exam/mock/${examId}/result/${resultId}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '제출 실패')
      setSubmitting(false)
    }
  }, [answers, examId, isPreviewMode, navigate, problems, started, submitting, userId])

  useEffect(() => {
    finishRef.current = () => {
      void finish()
    }
  }, [finish])

  if (loading) return <div className="mock-take mock-take--centered">불러오는 중…</div>
  if (err && problems.length === 0)
    return (
      <div className="mock-take mock-take--centered">
        <p>{err}</p>
        <Link to="/study/mock-exam">돌아가기</Link>
      </div>
    )

  if (!current)
    return (
      <div className="mock-take mock-take--centered">
        <p>문항이 없습니다.</p>
        <Link to="/study/mock-exam">돌아가기</Link>
      </div>
    )

  const displayProblemNumber =
    current.question_number > 0 ? current.question_number : idx + 1

  return (
    <div className="mock-take mock-take--mock">
      <header className="mock-take__top">
        <div>
          <p className="mock-take__badge">{isPreviewMode ? '미리보기' : '모의고사'}</p>
          <h1 className="mock-take__title">{examName}</h1>
          {isPreviewMode ? (
            <p className="mock-take__preview-hint">
              {previewFromCatalogDb
                ? `카탈로그에 등록된 문항 ${problems.length}개입니다.`
                : '카탈로그만 연결된 상태입니다. 샘플 2문항으로 레이아웃을 확인하세요.'}
            </p>
          ) : null}
        </div>
        <div className="mock-take__timer" aria-live="polite">
          남은 시간 <strong>{fmt(remainSec)}</strong>
        </div>
        <div className="mock-take__actions">
          <button type="button" className="mock-take__submit" disabled={submitting} onClick={() => void finish()}>
            {submitting ? '처리 중…' : isPreviewMode ? '나가기' : '시험 종료'}
          </button>
        </div>
      </header>

      {err ? <p className="mock-take__err">{err}</p> : null}

      <div
        className={`mock-take__body${showReadingAside ? ' mock-take__body--with-reading' : ''}`}
      >
        <nav className="mock-take__nav" aria-label="문항 번호">
          {problems.map((p, i) => {
            const n = p.question_number > 0 ? p.question_number : i + 1
            const groupStart = passageGroupStarts[i]
            return (
              <button
                key={p.id}
                type="button"
                title={groupStart ? '이 문항부터 읽기 자료(본문)가 바뀝니다' : undefined}
                className={`mock-take__num${i === idx ? ' mock-take__num--current' : ''}${
                  flagged[p.id] ? ' mock-take__num--flag' : ''
                }${answers[p.id] ? ' mock-take__num--done' : ''}${
                  groupStart ? ' mock-take__num--passage-group-start' : ''
                }`}
                onClick={() => setIdx(i)}
              >
                {n}
              </button>
            )
          })}
        </nav>
        {showReadingAside ? (
          <aside className="mock-take__reading" aria-label="읽기 자료(본문)">
            <p className="mock-take__reading-label">본문</p>
            <div className="mock-take__reading-scroll">
              {current.reading_body?.trim() ? renderExamRichText(current.reading_body.trim()) : null}
              <ReadingBodyDiagrams diagram={current.diagram} diagramUrl={current.diagram_url} />
            </div>
          </aside>
        ) : null}
        <div className="mock-take__main">
          <div className="mock-take__toolbar">
            <span className="mock-take__progress">
              {displayProblemNumber} / {problems.length}
            </span>
            <div className="mock-take__toolbar-right">
              {hasReadingPanel && isNarrow ? (
                <Button
                  type="button"
                  variant="light"
                  color="cyan"
                  size="xs"
                  radius="md"
                  onClick={openReadingDrawer}
                >
                  본문 보기
                </Button>
              ) : null}
              <label className="mock-take__flag">
                <input
                  type="checkbox"
                  checked={!!flagged[current.id]}
                  onChange={(e) => setFlagged((f) => ({ ...f, [current.id]: e.target.checked }))}
                />
                플래그
              </label>
            </div>
          </div>
          <ProblemRenderer
            instructionText={current.instruction}
            problemNumber={displayProblemNumber}
            questionText=""
            readingBody={current.reading_body}
            suppressReadingBody={hasReadingPanel}
            readingDiagram={current.diagram}
            readingDiagramUrl={current.diagram_url}
            passage={current.passage}
            choices={current.options}
            name={`q-${current.id}`}
            value={answers[current.id] ?? ''}
            onChange={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))}
          />
          <div className="mock-take__pager">
            <button type="button" disabled={idx <= 0} onClick={() => setIdx((i) => i - 1)}>
              이전
            </button>
            <button
              type="button"
              disabled={idx >= problems.length - 1}
              onClick={() => setIdx((i) => i + 1)}
            >
              다음
            </button>
          </div>
        </div>
      </div>

      <Drawer
        opened={readingDrawerOpen}
        onClose={closeReadingDrawer}
        position="bottom"
        size="85%"
        title="본문"
        padding="md"
        styles={{ body: { paddingTop: 4 } }}
      >
        <div className="mock-take__drawer-reading">
          {current.reading_body?.trim() ? renderExamRichText(current.reading_body.trim()) : null}
          <ReadingBodyDiagrams diagram={current.diagram} diagramUrl={current.diagram_url} />
        </div>
      </Drawer>
    </div>
  )
}
