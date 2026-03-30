import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ProblemRenderer } from '../../components/ProblemRenderer'
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

/** 응시 UI에 쓰는 필드만 정규화 (question_number·instruction·content·options; 채점용 correct_answer는 화면에 안 씀) */
type MockTakeSheetProblem = {
  id: string
  question_number: number
  instruction: string | null
  content: string | null
  options: unknown
  correct_answer: string
  examRow?: FasttrackProblemRow
}

function mapCatalogRowToSheet(r: {
  problem_id: string
  question_number: number
  instruction: string | null
  content: string | null
  options: unknown
  answer: number
}): MockTakeSheetProblem {
  return {
    id: r.problem_id,
    question_number: r.question_number,
    instruction: r.instruction,
    content: r.content,
    options: r.options,
    correct_answer: String(r.answer),
  }
}

function mapExamRowToSheet(p: FasttrackProblemRow): MockTakeSheetProblem {
  const merged = [p.passage, p.question_text].filter(Boolean).join('\n\n').trim()
  return {
    id: p.id,
    question_number: p.problem_number != null && p.problem_number > 0 ? p.problem_number : 0,
    instruction: p.instruction_text ?? null,
    content: merged.length > 0 ? merged : null,
    options: p.choices,
    correct_answer: p.correct_answer,
    examRow: p,
  }
}

/** 미리보기 스텁을 카탈로그 4필드 표시에 맞춤: 지문+발문을 content 한 블록으로 */
function mapPreviewStubToSheet(p: FasttrackProblemRow): MockTakeSheetProblem {
  const merged = [p.passage, p.question_text].filter(Boolean).join('\n\n').trim()
  return {
    id: p.id,
    question_number: p.problem_number != null && p.problem_number > 0 ? p.problem_number : 0,
    instruction: p.instruction_text ?? null,
    content: merged.length > 0 ? merged : null,
    options: p.choices,
    correct_answer: p.correct_answer,
  }
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

      <div className="mock-take__body">
        <nav className="mock-take__nav" aria-label="문항 번호">
          {problems.map((p, i) => {
            const n = p.question_number > 0 ? p.question_number : i + 1
            return (
              <button
                key={p.id}
                type="button"
                className={`mock-take__num${i === idx ? ' mock-take__num--current' : ''}${
                  flagged[p.id] ? ' mock-take__num--flag' : ''
                }${answers[p.id] ? ' mock-take__num--done' : ''}`}
                onClick={() => setIdx(i)}
              >
                {n}
              </button>
            )
          })}
        </nav>
        <div className="mock-take__main">
          <div className="mock-take__toolbar">
            <span className="mock-take__progress">
              {displayProblemNumber} / {problems.length}
            </span>
            <label className="mock-take__flag">
              <input
                type="checkbox"
                checked={!!flagged[current.id]}
                onChange={(e) => setFlagged((f) => ({ ...f, [current.id]: e.target.checked }))}
              />
              플래그
            </label>
          </div>
          <ProblemRenderer
            instructionText={current.instruction}
            problemNumber={displayProblemNumber}
            questionText=""
            passage={current.content}
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
    </div>
  )
}
