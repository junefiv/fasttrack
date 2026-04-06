import { Button, Drawer, Textarea } from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ProblemRenderer } from '../../components/ProblemRenderer'
import { ReadingBodyDiagrams } from '../../components/ReadingBodyDiagrams'
import { getFasttrackUserId } from '../../lib/fasttrackUser'
import { fetchSubjects } from '../../lib/fasttrackQueries'
import {
  fetchUserQaQuestionById,
  fetchUserQaQuestionsForSubject,
  filterUserQaRows,
  gradeUserQaAnswer,
  type UserQaQuestionRow,
} from '../../lib/userQaQuestions'
import { renderExamRichText } from '../../lib/richExamText'
import { messageFromUnknownError } from '../../lib/unknownError'
import type { SubjectRow } from '../../types/fasttrack'
import '../mock-exam/MockExamTakePage.css'
import '../mock-exam/QuestionsBankDrillPage.css'

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

function normalizeOxAnswer(a: string): string {
  const t = a.trim().toUpperCase()
  if (t === 'O' || t === 'X') return t
  if (t.startsWith('O')) return 'O'
  if (t.startsWith('X')) return 'X'
  return a.trim()
}

function mapUserQaToSheet(r: UserQaQuestionRow): SheetProblem {
  const rb = r.content?.trim() ? r.content : null
  const ap = r.additional_passage?.trim() ? r.additional_passage : null
  const du = r.diagram_url?.trim() ? r.diagram_url.trim() : null
  let options: unknown = r.options
  if (r.kind === 'ox') {
    options = [
      { id: 'O', text: 'O' },
      { id: 'X', text: 'X' },
    ]
  }
  const correct =
    r.kind === 'ox' ? normalizeOxAnswer(r.answer) : r.answer.trim()
  return {
    id: r.id,
    question_number: 1,
    instruction: r.instruction?.trim() ? r.instruction : null,
    reading_body: rb,
    diagram: null,
    diagram_url: du,
    passage: ap,
    options,
    correct_answer: correct,
  }
}

function problemHasReadingPanel(p: SheetProblem | undefined): boolean {
  if (!p) return false
  return Boolean(p.reading_body?.trim() || p.diagram?.trim() || p.diagram_url?.trim())
}

function mergeUniqueIds(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])]
}

function retryMinGap(bankCount: number): number {
  if (bankCount <= 1) return 3
  return Math.max(3, Math.min(30, Math.floor(bankCount * 0.2)))
}

type GradingKind = 'passed' | 'wrong_answer' | 'time_exceeded'

function pickNextUserQa(
  pool: UserQaQuestionRow[],
  excludeIds: string[],
  retryBlockedIds: string[],
  weakCategories: string[],
  weakTags: string[],
): UserQaQuestionRow | null {
  const sliced = excludeIds.slice(-50)
  const merged = mergeUniqueIds(sliced, retryBlockedIds)
  let candidates = pool.filter((r) => !merged.includes(r.id))

  if (weakCategories.length > 0 || weakTags.length > 0) {
    const weakPool = candidates.filter((r) => {
      const cat = r.category_label?.trim()
      const tagMatch = (r.tags ?? []).some((t) => weakTags.includes(String(t).trim()))
      const catMatch = Boolean(cat && weakCategories.includes(cat))
      return catMatch || tagMatch
    })
    if (weakPool.length > 0) candidates = weakPool
  }

  if (candidates.length === 0) {
    candidates = pool.filter((r) => !sliced.includes(r.id))
  }
  if (candidates.length === 0) {
    candidates = [...pool]
  }
  if (candidates.length === 0) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}

const FREE_TEXT_KINDS = new Set(['short_answer', 'essay'])

export function UserQaDrillPage() {
  const [searchParams] = useSearchParams()
  const subjectFromUrl = searchParams.get('subject')?.trim() ?? ''
  const deepLinkQuestionId = searchParams.get('question')?.trim() ?? ''
  const filterCats = searchParams.getAll('cat').map((c) => c.trim()).filter(Boolean)
  const filterTags = searchParams.getAll('tag').map((t) => t.trim()).filter(Boolean)

  const userId = getFasttrackUserId()
  const [resolvedSubjectId, setResolvedSubjectId] = useState<string | null>(null)
  const [subjectBootstrapErr, setSubjectBootstrapErr] = useState<string | null>(null)

  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [pool, setPool] = useState<UserQaQuestionRow[]>([])
  const poolRef = useRef<UserQaQuestionRow[]>([])
  useEffect(() => {
    poolRef.current = pool
  }, [pool])

  const [row, setRow] = useState<UserQaQuestionRow | null>(null)
  const [sheet, setSheet] = useState<SheetProblem | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [answer, setAnswer] = useState('')
  const [flagged, setFlagged] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [weakCategories, setWeakCategories] = useState<string[]>([])
  const [weakTags, setWeakTags] = useState<string[]>([])
  const [excludeIds, setExcludeIds] = useState<string[]>([])
  const [drillRound, setDrillRound] = useState(0)
  const [retryNotBefore, setRetryNotBefore] = useState<Record<string, number>>({})
  const [questionStartedAt, setQuestionStartedAt] = useState(() => Date.now())
  const [elapsedSec, setElapsedSec] = useState(0)
  const [lastSubmit, setLastSubmit] = useState<{
    grading: GradingKind
    solveTimeSec: number
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingNext, setLoadingNext] = useState(false)

  const subjectId = subjectFromUrl || resolvedSubjectId || ''

  useEffect(() => {
    setResolvedSubjectId(null)
    setSubjectBootstrapErr(null)
    if (subjectFromUrl || !deepLinkQuestionId) return
    let cancelled = false
    void (async () => {
      try {
        const r = await fetchUserQaQuestionById(deepLinkQuestionId)
        if (cancelled) return
        if (!r || r.user_id !== userId) {
          setSubjectBootstrapErr('해당 문항을 찾을 수 없거나 권한이 없습니다.')
          return
        }
        setResolvedSubjectId(r.subject_id)
      } catch (e) {
        if (!cancelled) {
          setSubjectBootstrapErr(messageFromUnknownError(e) || '문항을 불러오지 못했습니다.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [subjectFromUrl, deepLinkQuestionId, userId])

  const isNarrow = useMediaQuery('(max-width: 960px)')
  const [readingDrawerOpen, { open: openReadingDrawer, close: closeReadingDrawer }] = useDisclosure(false)

  const subjectName = useMemo(
    () => subjects.find((s) => s.id === subjectId)?.name ?? '과목',
    [subjects, subjectId],
  )

  const bankCount = pool.length
  const minGap = useMemo(() => retryMinGap(bankCount), [bankCount])

  useEffect(() => {
    let cancelled = false
    void (async () => {
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
    (
      nextExclude: string[],
      cats: string[],
      tags: string[],
      retryGate: Record<string, number>,
      currentRound: number,
      opts?: { isAdvance?: boolean },
    ) => {
      const p = poolRef.current
      if (p.length === 0) return
      setErr(null)
      if (opts?.isAdvance) setLoadingNext(true)
      else setPhase('loading')
      try {
        const retryBlockedIds = Object.entries(retryGate)
          .filter(([, minR]) => currentRound < minR)
          .map(([id]) => id)
        const picked = pickNextUserQa(p, nextExclude, retryBlockedIds, cats, tags)
        if (!picked) {
          setErr('풀 수 있는 문항이 없습니다. 필터를 넓히거나 내 문제함에 문항을 추가해 보세요.')
          if (!opts?.isAdvance) {
            setRow(null)
            setSheet(null)
            setPhase('loading')
          }
          return
        }
        setRow(picked)
        setSheet(mapUserQaToSheet(picked))
        setAnswer('')
        setFlagged(false)
        setLastSubmit(null)
        setQuestionStartedAt(Date.now())
        setElapsedSec(0)
        setPhase('answering')
        setDrillRound((r) => r + 1)
      } catch (e) {
        setErr(messageFromUnknownError(e) || '문항을 불러오지 못했습니다.')
        if (!opts?.isAdvance) {
          setRow(null)
          setSheet(null)
        }
      } finally {
        if (opts?.isAdvance) setLoadingNext(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!subjectId) return
    let cancelled = false
    setDrillRound(0)
    setRetryNotBefore({})
    setExcludeIds([])
    void (async () => {
      setPhase('loading')
      setErr(null)
      try {
        const all = await fetchUserQaQuestionsForSubject(userId, subjectId)
        if (cancelled) return
        const filtered = filterUserQaRows(all, { categoryLabels: filterCats, tags: filterTags })

        if (deepLinkQuestionId) {
          const r =
            filtered.find((x) => x.id === deepLinkQuestionId) ??
            (await fetchUserQaQuestionById(deepLinkQuestionId))
          if (cancelled) return
          if (!r || r.user_id !== userId || r.subject_id !== subjectId) {
            setErr('해당 문항을 찾을 수 없거나 과목이 일치하지 않습니다.')
            setRow(null)
            setSheet(null)
            return
          }
          const poolFinal = filtered.some((x) => x.id === r.id) ? filtered : [...filtered, r]
          poolRef.current = poolFinal
          setPool(poolFinal)
          setRow(r)
          setSheet(mapUserQaToSheet(r))
          setAnswer('')
          setFlagged(false)
          setLastSubmit(null)
          setQuestionStartedAt(Date.now())
          setElapsedSec(0)
          setPhase('answering')
          setDrillRound(1)
          return
        }

        poolRef.current = filtered
        setPool(filtered)
        if (filtered.length === 0) {
          setErr('이 조건에 맞는 내 문항이 없습니다. 학습 아카이브에서 문항을 만들거나 필터를 바꿔 보세요.')
          setRow(null)
          setSheet(null)
          return
        }

        loadQuestion([], [], [], {}, 0)
      } catch (e) {
        if (!cancelled) {
          setErr(messageFromUnknownError(e) || '문항을 불러오지 못했습니다.')
          setRow(null)
          setSheet(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [subjectId, userId, deepLinkQuestionId, filterCats.join('\0'), filterTags.join('\0'), loadQuestion])

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
  const isFreeText = row != null && FREE_TEXT_KINDS.has(row.kind)

  useEffect(() => {
    closeReadingDrawer()
  }, [current?.id, closeReadingDrawer])

  const fmt = useCallback((sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [])

  const estimatedSec = row?.estimated_time ?? null
  const isSlow = estimatedSec != null && estimatedSec > 0 && elapsedSec > estimatedSec

  const handleSubmitAnswer = async () => {
    if (!row || !sheet || phase !== 'answering' || submitting) return
    const trimmed = answer.trim()
    if (!trimmed) {
      setErr('답을 선택하거나 입력하세요.')
      return
    }
    setSubmitting(true)
    setErr(null)
    const solveTimeSec = Math.max(0, Math.floor((Date.now() - questionStartedAt) / 1000))
    try {
      const { isCorrect: contentCorrect } = gradeUserQaAnswer(row, trimmed)
      const slow = estimatedSec != null && estimatedSec > 0 && solveTimeSec > estimatedSec
      const passed = contentCorrect && !slow
      const grading: GradingKind = passed ? 'passed' : contentCorrect && slow ? 'time_exceeded' : 'wrong_answer'

      if (!passed) {
        setRetryNotBefore((prev) => ({
          ...prev,
          [row.id]: drillRound + minGap,
        }))
        const cat = row.category_label?.trim()
        if (cat) {
          setWeakCategories((prev) => Array.from(new Set([...prev, cat])))
        }
        const tagList = (row.tags ?? []).map((t) => t.trim()).filter(Boolean)
        if (tagList.length > 0) {
          setWeakTags((prev) => Array.from(new Set([...prev, ...tagList])))
        }
      } else {
        setRetryNotBefore((prev) => {
          const next = { ...prev }
          delete next[row.id]
          return next
        })
      }

      setLastSubmit({ grading, solveTimeSec })
      setPhase('submitted')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '제출에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleNext = async () => {
    if (!row || loadingNext) return
    const nextExclude = [...excludeIds, row.id].slice(-60)
    setExcludeIds(nextExclude)
    loadQuestion(nextExclude, weakCategories, weakTags, retryNotBefore, drillRound, {
      isAdvance: true,
    })
  }

  const archiveBack = '/study/archive?tab=my-questions'

  if (!subjectFromUrl && !deepLinkQuestionId) {
    return (
      <div className="mock-take mock-take--centered">
        <p>과목이 지정되지 않았습니다.</p>
        <p style={{ fontSize: '0.9rem', opacity: 0.85, maxWidth: 420, marginTop: 8 }}>
          내 문제함 드릴은 URL에 <code>subject</code> 또는 문항 <code>question</code>이 필요합니다.
        </p>
        <Link to={archiveBack}>학습 아카이브로</Link>
      </div>
    )
  }

  if (!subjectFromUrl && deepLinkQuestionId && !subjectId && !subjectBootstrapErr) {
    return <div className="mock-take mock-take--centered">문항 정보를 불러오는 중…</div>
  }

  if (!subjectFromUrl && deepLinkQuestionId && subjectBootstrapErr) {
    return (
      <div className="mock-take mock-take--centered">
        <p>{subjectBootstrapErr}</p>
        <Link to={archiveBack}>학습 아카이브로</Link>
      </div>
    )
  }

  if (!subjectId) {
    return (
      <div className="mock-take mock-take--centered">
        <p>과목을 확인할 수 없습니다.</p>
        <Link to={archiveBack}>학습 아카이브로</Link>
      </div>
    )
  }

  if (err && !sheet) {
    return (
      <div className="mock-take mock-take--centered">
        <p>{err}</p>
        <Link to={archiveBack}>돌아가기</Link>
      </div>
    )
  }

  if (phase === 'loading' && !sheet) {
    return <div className="mock-take mock-take--centered">문항을 불러오는 중…</div>
  }

  if (!current || !row) {
    return (
      <div className="mock-take mock-take--centered">
        <p>표시할 문항이 없습니다.</p>
        <Link to={archiveBack}>돌아가기</Link>
      </div>
    )
  }

  const displayProblemNumber = 1
  const statsLine =
    bankCount > 0
      ? `이 세션 풀: ${bankCount}문항 · 내가 만든 문항만 출제됩니다.`
      : '내가 만든 문항만 출제됩니다.'

  return (
    <div className="mock-take mock-take--mock mock-take--qbank">
      <header className="mock-take__top">
        <div>
          <p className="mock-take__badge">내 문제함 드릴</p>
          <h1 className="mock-take__title">{subjectName}</h1>
          <p className="mock-take__preview-hint qbank-drill__hint">
            권장 시간을 넘기면 정답이어도 미통과로 처리됩니다. 미통과 문항은 풀을 한 바퀴 돈 뒤에 다시 나옵니다.
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
          <Link to={archiveBack} className="mock-take__submit mock-take__submit--link">
            종료
          </Link>
        </div>
      </header>

      {err ? <p className="mock-take__err">{err}</p> : null}

      <p className="qbank-drill__stats" aria-live="polite">
        {statsLine}
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
            choices={isFreeText ? [] : current.options}
            name={`uqa-${current.id}`}
            value={answer}
            onChange={(v) => setAnswer(v)}
            disabled={phase === 'submitted'}
            showCorrect={phase === 'submitted' && lastSubmit?.grading !== 'passed'}
            correctAnswer={current.correct_answer}
            recommendedTimeSec={row.estimated_time ?? null}
            questionCategory={row.category_label ?? null}
            keywords={row.tags ?? null}
            difficultyLabel={row.difficulty_level ?? null}
            noChoicesContent={
              isFreeText ? (
                <div className="problem-renderer__freetext">
                  <p className="problem-renderer__label">{row.kind === 'essay' ? '서술 답안' : '답안'}</p>
                  <Textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.currentTarget.value)}
                    disabled={phase === 'submitted'}
                    minRows={row.kind === 'essay' ? 6 : 2}
                    autosize
                    maxRows={16}
                  />
                  {phase === 'submitted' && lastSubmit?.grading !== 'passed' ? (
                    <p className="problem-renderer__freetext-answer" style={{ marginTop: 8, fontSize: '0.9rem' }}>
                      정답: {row.answer}
                    </p>
                  ) : null}
                </div>
              ) : undefined
            }
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
