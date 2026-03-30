import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ProblemRenderer } from '../../components/ProblemRenderer'
import { getFasttrackUserId } from '../../lib/fasttrackUser'
import { fetchDrillProblems, submitDrillSession } from '../../lib/fasttrackQueries'
import { upsertStudentStatsAfterSession } from '../../lib/fasttrackStats'
import type { FasttrackDrillProblemRow } from '../../types/fasttrack'
import './DrillTakePage.css'

type Step = 'intro' | 'take' | 'done'

export function DrillTakePage() {
  const [params] = useSearchParams()
  const userId = getFasttrackUserId()
  const idsParam = params.get('ids') ?? ''
  const ids = idsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const [step, setStep] = useState<Step>('intro')
  const [rows, setRows] = useState<FasttrackDrillProblemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [started] = useState(() => Date.now())
  const [submitting, setSubmitting] = useState(false)
  const finishRef = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (ids.length === 0) {
        setErr('드릴 문제 id가 없습니다.')
        setLoading(false)
        return
      }
      try {
        const list = await fetchDrillProblems(ids)
        if (cancelled) return
        if (list.length === 0) {
          setErr('드릴 문제를 찾을 수 없습니다.')
        }
        setRows(list)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '로드 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [idsParam])

  const current = rows[idx]
  const leaderId = rows[0]?.id ?? ''

  const finish = useCallback(async () => {
    if (submitting || rows.length === 0 || !leaderId) return
    setSubmitting(true)
    try {
      const timeSpentSec = Math.max(0, Math.floor((Date.now() - started) / 1000))
      await submitDrillSession({
        userId,
        drillProblemIds: ids,
        leaderDrillId: leaderId,
        timeSpentSec,
        drillRows: rows,
        answers,
      })
      const statsPayload = rows.map((p) => ({
        problem: p,
        is_correct: (answers[p.id] ?? '').trim() === String(p.correct_answer).trim(),
      }))
      await upsertStudentStatsAfterSession(userId, statsPayload)
      setStep('done')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '제출 실패')
    } finally {
      setSubmitting(false)
    }
  }, [answers, ids, leaderId, rows, started, submitting, userId])

  useEffect(() => {
    finishRef.current = () => {
      void finish()
    }
  }, [finish])

  if (loading) return <div className="drill-take drill-take--centered">드릴 불러오는 중…</div>
  if (err && rows.length === 0)
    return (
      <div className="drill-take drill-take--centered">
        <p>{err}</p>
        <Link to="/study/mock-exam">홈으로</Link>
      </div>
    )

  const first = rows[0]

  if (step === 'intro' && first) {
    return (
      <div className="drill-take drill-take--drill">
        <div className="drill-take__intro">
          <p className="drill-take__badge">개인화 드릴</p>
          <h1 className="drill-take__title">시작 전 안내</h1>
          <div className="drill-take__reason">
            <p className="drill-take__reason-label">AI 분석 요약</p>
            <p>
              {first.version_type === 'upper'
                ? '상위(더 어려운) 변형으로 변별력을 높입니다.'
                : '하위(기초) 변형으로 개념을 다집니다.'}{' '}
              약점 점수가 높을수록 상위 드릴, 낮을수록 하위 드릴을 권장합니다.
            </p>
            <p className="drill-take__meta">
              문항 {rows.length}개 · 난이도 {first.difficulty}
            </p>
          </div>
          <button type="button" className="drill-take__start" onClick={() => setStep('take')}>
            드릴 시작
          </button>
          <Link to="/study/mock-exam" className="drill-take__back">
            취소하고 홈으로
          </Link>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="drill-take drill-take--done">
        <div className="drill-take__celebrate" role="status">
          <span className="drill-take__spark" aria-hidden />
          <h1>마스터 달성!</h1>
          <p>통계가 갱신되었습니다.</p>
        </div>
        <div className="drill-take__done-actions">
          <Link to="/study/mock-exam" className="drill-take__btn">
            홈으로
          </Link>
          <Link to="/d-agent/mh-chat" className="drill-take__btn drill-take__btn--ghost">
            AI 해설 보기
          </Link>
        </div>
      </div>
    )
  }

  if (!current)
    return (
      <div className="drill-take drill-take--centered">
        <p>문항이 없습니다.</p>
      </div>
    )

  return (
    <div className="drill-take drill-take--drill">
      <header className="drill-take__top">
        <div>
          <p className="drill-take__badge">드릴</p>
          <h1 className="drill-take__title">
            {current.version_type === 'upper' ? '상위' : '하위'} 드릴
          </h1>
        </div>
        <div className="drill-take__actions">
          <Link to="/d-agent/mh-chat" className="drill-take__hint">
            AI 힌트
          </Link>
          <button type="button" className="drill-take__submit" disabled={submitting} onClick={() => void finish()}>
            {submitting ? '저장 중…' : '드릴 완료'}
          </button>
        </div>
      </header>
      {err ? <p className="drill-take__err">{err}</p> : null}
      <div className="drill-take__body">
        <nav className="drill-take__nav" aria-label="문항 번호">
          {rows.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`drill-take__num${i === idx ? ' drill-take__num--current' : ''}${
                answers[p.id] ? ' drill-take__num--done' : ''
              }`}
              onClick={() => setIdx(i)}
            >
              {i + 1}
            </button>
          ))}
        </nav>
        <div className="drill-take__main">
          <p className="drill-take__progress">
            {idx + 1} / {rows.length}
          </p>
          <ProblemRenderer
            questionText={current.question_text}
            passage={current.passage}
            referenceView={current.reference_view}
            choices={current.choices}
            name={`d-${current.id}`}
            value={answers[current.id] ?? ''}
            onChange={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))}
          />
          <div className="drill-take__pager">
            <button type="button" disabled={idx <= 0} onClick={() => setIdx((i) => i - 1)}>
              이전
            </button>
            <button type="button" disabled={idx >= rows.length - 1} onClick={() => setIdx((i) => i + 1)}>
              다음
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
