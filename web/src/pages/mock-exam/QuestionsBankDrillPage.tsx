import { Button, Drawer } from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ProblemRenderer } from '../../components/ProblemRenderer'
import { ReadingBodyDiagrams } from '../../components/ReadingBodyDiagrams'
import { renderExamRichText } from '../../lib/richExamText'
import { getFasttrackUserId } from '../../lib/fasttrackUser'
import {
  fetchQuestionsBankCountForSubject,
  fetchQuestionsBankStatsForQuestion,
  fetchSubjects,
  insertQuestionsBankResult,
  pickQuestionsBankQuestion,
} from '../../lib/fasttrackQueries'
import type { SubjectRow } from '../../types/fasttrack'
import type { QuestionsBankRow } from '../../types/questionsBank'
import { messageFromUnknownError } from '../../lib/unknownError'
import './MockExamTakePage.css'
import './QuestionsBankDrillPage.css'

type Phase = 'loading' | 'answering' | 'submitted'

type SheetProblem = {
  id: string
  question_number: number
  instruction: string | null
  reading_body: string | null
  diagram: string | null
  diagram_url: string | null
  passage: string | null
  options: unknown
  correct_answer: string
}

function mapBankToSheet(r: QuestionsBankRow): SheetProblem {
  const rb = r.content?.trim() ? r.content : null
  const ap = r.additional_passage?.trim() ? r.additional_passage : null
  const du = r.diagram_url?.trim() ? r.diagram_url.trim() : null
  return {
    id: r.question_id,
    question_number: 1,
    instruction: r.instruction,
    reading_body: rb,
    diagram: null,
    diagram_url: du,
    passage: ap,
    options: r.options,
    correct_answer: r.answer,
  }
}

function problemHasReadingPanel(p: SheetProblem | undefined): boolean {
  if (!p) return false
  return Boolean(p.reading_body?.trim() || p.diagram?.trim() || p.diagram_url?.trim())
}

function mergeUniqueIds(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])]
}

/** 은행 크기에 비례해, 틀린 문항을 다시 내기 전에 거쳐야 할 다른 문항 수(최소 순회) */
function retryMinGap(bankCount: number): number {
  if (bankCount <= 1) return 3
  return Math.max(3, Math.min(30, Math.floor(bankCount * 0.2)))
}

type GradingKind = 'passed' | 'wrong_answer' | 'time_exceeded'

function gradingFromRow(isCorrect: boolean, answerMatches: boolean): GradingKind {
  if (isCorrect) return 'passed'
  if (answerMatches) return 'time_exceeded'
  return 'wrong_answer'
}

async function pickNextQuestion(
  subjectId: string,
  excludeIds: string[],
  retryBlockedIds: string[],
  weakCategories: string[],
  weakTags: string[],
): Promise<QuestionsBankRow | null> {
  const sliced = excludeIds.slice(-50)
  const merged = mergeUniqueIds(sliced, retryBlockedIds)
  let row = await pickQuestionsBankQuestion({
    subjectId,
    excludeIds: merged,
    weakCategories,
    weakTags,
  })
  if (!row && merged.length > sliced.length) {
    row = await pickQuestionsBankQuestion({
      subjectId,
      excludeIds: sliced,
      weakCategories,
      weakTags,
    })
  }
  if (!row) {
    row = await pickQuestionsBankQuestion({
      subjectId,
      excludeIds: [],
      weakCategories,
      weakTags,
    })
  }
  return row
}

export function QuestionsBankDrillPage() {
  const [searchParams] = useSearchParams()
  const subjectId = searchParams.get('subject')?.trim() ?? ''
  const userId = getFasttrackUserId()

  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [bankRow, setBankRow] = useState<QuestionsBankRow | null>(null)
  const [sheet, setSheet] = useState<SheetProblem | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [answer, setAnswer] = useState('')
  const [flagged, setFlagged] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [weakCategories, setWeakCategories] = useState<string[]>([])
  const [weakTags, setWeakTags] = useState<string[]>([])
  const [excludeIds, setExcludeIds] = useState<string[]>([])
  /** 현재까지 시작한 문항 수(순회 간격 계산용). 첫 문항 로드 후 1. */
  const [drillRound, setDrillRound] = useState(0)
  /** 미통과 문항: drillRound가 이 값 이상일 때만 다시 출제 후보 */
  const [retryNotBefore, setRetryNotBefore] = useState<Record<string, number>>({})
  const [bankCount, setBankCount] = useState(0)
  const [questionStartedAt, setQuestionStartedAt] = useState(() => Date.now())
  const [elapsedSec, setElapsedSec] = useState(0)
  const [stats, setStats] = useState<{ correctCount: number; totalCount: number } | null>(null)
  const [lastSubmit, setLastSubmit] = useState<{
    grading: GradingKind
    solveTimeSec: number
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingNext, setLoadingNext] = useState(false)

  const isNarrow = useMediaQuery('(max-width: 960px)')
  const [readingDrawerOpen, { open: openReadingDrawer, close: closeReadingDrawer }] = useDisclosure(false)

  const subjectName = useMemo(
    () => subjects.find((s) => s.id === subjectId)?.name ?? '과목',
    [subjects, subjectId],
  )

  const minGap = useMemo(() => retryMinGap(bankCount), [bankCount])

  useEffect(() => {
    if (!subjectId) return
    let cancelled = false
    ;(async () => {
      try {
        const n = await fetchQuestionsBankCountForSubject(subjectId)
        if (!cancelled) setBankCount(n)
      } catch {
        if (!cancelled) setBankCount(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [subjectId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchSubjects()
        if (!cancelled) setSubjects(list)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadQuestion = useCallback(
    async (
      nextExclude: string[],
      cats: string[],
      tags: string[],
      retryGate: Record<string, number>,
      currentRound: number,
      opts?: { isAdvance?: boolean },
    ) => {
      if (!subjectId) return
      setErr(null)
      if (opts?.isAdvance) setLoadingNext(true)
      else setPhase('loading')
      try {
        const retryBlockedIds = Object.entries(retryGate)
          .filter(([, minR]) => currentRound < minR)
          .map(([id]) => id)
        const row = await pickNextQuestion(subjectId, nextExclude, retryBlockedIds, cats, tags)
        if (!row) {
          setErr('이 과목에 풀 수 있는 문제은행 문항이 없습니다.')
          if (!opts?.isAdvance) {
            setBankRow(null)
            setSheet(null)
            setPhase('loading')
          }
          return
        }
        setBankRow(row)
        setSheet(mapBankToSheet(row))
        setAnswer('')
        setFlagged(false)
        setLastSubmit(null)
        setQuestionStartedAt(Date.now())
        setElapsedSec(0)
        setPhase('answering')
        setDrillRound((r) => r + 1)
        const s = await fetchQuestionsBankStatsForQuestion(row.question_id)
        setStats(s)
      } catch (e) {
        setErr(messageFromUnknownError(e) || '문항을 불러오지 못했습니다.')
        if (!opts?.isAdvance) {
          setBankRow(null)
          setSheet(null)
        }
      } finally {
        if (opts?.isAdvance) setLoadingNext(false)
      }
    },
    [subjectId],
  )

  useEffect(() => {
    if (!subjectId) return
    setDrillRound(0)
    setRetryNotBefore({})
    setExcludeIds([])
    void loadQuestion([], [], [], {}, 0)
  }, [subjectId, loadQuestion])

  useEffect(() => {
    if (phase !== 'answering') return
    const t = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - questionStartedAt) / 1000)))
    }, 1000)
    return () => window.clearInterval(t)
  }, [phase, questionStartedAt])

  const current = sheet
  const hasReadingPanel = problemHasReadingPanel(current ?? undefined)
  const showReadingAside = hasReadingPanel && !isNarrow

  useEffect(() => {
    closeReadingDrawer()
  }, [current?.id, closeReadingDrawer])

  const fmt = useCallback((sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [])

  const estimatedSec = bankRow?.estimated_time ?? null
  const isSlow = estimatedSec != null && estimatedSec > 0 && elapsedSec > estimatedSec

  const handleSubmitAnswer = async () => {
    if (!bankRow || !sheet || phase !== 'answering' || submitting) return
    const trimmed = answer.trim()
    if (!trimmed) {
      setErr('답을 선택하거나 입력하세요.')
      return
    }
    setSubmitting(true)
    setErr(null)
    const solveTimeSec = Math.max(0, Math.floor((Date.now() - questionStartedAt) / 1000))
    try {
      const { is_correct: isCorrect, answer_matches: answerMatches } = await insertQuestionsBankResult({
        userId,
        questionId: bankRow.question_id,
        userAnswer: trimmed,
        solveTimeSec,
      })
      const grading = gradingFromRow(isCorrect, answerMatches)
      if (!isCorrect) {
        setRetryNotBefore((prev) => ({
          ...prev,
          [bankRow.question_id]: drillRound + minGap,
        }))
      } else {
        setRetryNotBefore((prev) => {
          const next = { ...prev }
          delete next[bankRow.question_id]
          return next
        })
      }
      if (!isCorrect) {
        const cat = bankRow.category_label?.trim()
        if (cat) {
          setWeakCategories((prev) => Array.from(new Set([...prev, cat])))
        }
        const tagList = (bankRow.tags ?? []).map((t) => t.trim()).filter(Boolean)
        if (tagList.length > 0) {
          setWeakTags((prev) => Array.from(new Set([...prev, ...tagList])))
        }
      }
      setLastSubmit({ grading, solveTimeSec })
      setPhase('submitted')
      const s = await fetchQuestionsBankStatsForQuestion(bankRow.question_id)
      setStats(s)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '제출에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNext = async () => {
    if (!bankRow || loadingNext) return
    const nextExclude = [...excludeIds, bankRow.question_id].slice(-60)
    setExcludeIds(nextExclude)
    await loadQuestion(nextExclude, weakCategories, weakTags, retryNotBefore, drillRound, {
      isAdvance: true,
    })
  }

  if (!subjectId) {
    return (
      <div className="mock-take mock-take--centered">
        <p>과목이 지정되지 않았습니다.</p>
        <Link to="/study/mock-exam">모의고사 · 드릴 홈으로</Link>
      </div>
    )
  }

  if (err && !sheet) {
    return (
      <div className="mock-take mock-take--centered">
        <p>{err}</p>
        <Link to="/study/mock-exam">돌아가기</Link>
      </div>
    )
  }

  if (phase === 'loading' && !sheet) {
    return <div className="mock-take mock-take--centered">문항을 불러오는 중…</div>
  }

  if (!current) {
    return (
      <div className="mock-take mock-take--centered">
        <p>표시할 문항이 없습니다.</p>
        <Link to="/study/mock-exam">돌아가기</Link>
      </div>
    )
  }

  const displayProblemNumber = 1
  const globalRateText =
    stats && stats.totalCount > 0
      ? `전체 학습자 정답률 ${Math.round((stats.correctCount / stats.totalCount) * 1000) / 10}% (${stats.correctCount}/${stats.totalCount})`
      : '아직 다른 학습자의 풀이 기록이 없습니다.'

  return (
    <div className="mock-take mock-take--mock mock-take--qbank">
      <header className="mock-take__top">
        <div>
          <p className="mock-take__badge">문제은행 드릴</p>
          <h1 className="mock-take__title">{subjectName}</h1>
          <p className="mock-take__preview-hint qbank-drill__hint">
            권장 시간을 넘기면 정답이어도 미통과로 처리됩니다. 미통과 문항은 은행을 한 바퀴 돈 뒤에 다시 나옵니다.
          </p>
        </div>
        <div className="mock-take__timer" aria-live="polite">
          {phase === 'answering' ? (
            <>
              경과 <strong>{fmt(elapsedSec)}</strong>
              {estimatedSec != null && estimatedSec > 0 ? (
                <span className={isSlow ? 'qbank-drill__slow' : ''}> · 권장 {estimatedSec}초</span>
              ) : null}
            </>
          ) : (
            <span className="mock-take__preview-hint">채점 완료</span>
          )}
        </div>
        <div className="mock-take__actions">
          <Link to="/study/mock-exam" className="mock-take__submit mock-take__submit--link">
            종료
          </Link>
        </div>
      </header>

      {err ? <p className="mock-take__err">{err}</p> : null}

      <p className="qbank-drill__stats" aria-live="polite">
        {globalRateText}
      </p>

      {lastSubmit && phase === 'submitted' ? (
        <div
          className={`qbank-drill__feedback${
            lastSubmit.grading === 'passed'
              ? ' qbank-drill__feedback--ok'
              : lastSubmit.grading === 'time_exceeded'
                ? ' qbank-drill__feedback--time'
                : ' qbank-drill__feedback--bad'
          }`}
          role="status"
        >
          {lastSubmit.grading === 'passed'
            ? '정답입니다.'
            : lastSubmit.grading === 'time_exceeded'
              ? '시간 초과입니다. 내용은 맞았으나 권장 시간을 넘겨 미통과로 기록되었습니다.'
              : '오답입니다.'}
        </div>
      ) : null}

      <div
        className={`mock-take__body${showReadingAside ? ' mock-take__body--with-reading' : ''}`}
      >
        <nav className="mock-take__nav" aria-label="문항 번호" />

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
            <span className="mock-take__progress">드릴 문항</span>
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
                  checked={flagged}
                  onChange={(e) => setFlagged(e.target.checked)}
                  disabled={phase === 'submitted'}
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
            name={`qb-${current.id}`}
            value={answer}
            onChange={(v) => setAnswer(v)}
            disabled={phase === 'submitted'}
            showCorrect={phase === 'submitted' && lastSubmit?.grading !== 'passed'}
            correctAnswer={current.correct_answer}
            recommendedTimeSec={bankRow?.estimated_time ?? null}
            questionCategory={bankRow?.category_label ?? null}
            keywords={bankRow?.tags ?? null}
          />

          <div className="mock-take__pager">
            {phase === 'answering' ? (
              <button
                type="button"
                className="qbank-drill__submit-primary"
                disabled={submitting}
                onClick={() => void handleSubmitAnswer()}
              >
                {submitting ? '제출 중…' : '답안 제출'}
              </button>
            ) : (
              <>
                <span className="qbank-drill__pager-spacer" />
                <button
                  type="button"
                  className="qbank-drill__submit-primary"
                  disabled={loadingNext}
                  onClick={() => void handleNext()}
                >
                  {loadingNext ? '불러오는 중…' : '다음 문제'}
                </button>
              </>
            )}
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
