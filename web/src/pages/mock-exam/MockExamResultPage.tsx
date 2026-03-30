import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ProblemRenderer } from '../../components/ProblemRenderer'
import {
  fetchProblemsByIds,
  fetchTestResult,
  fetchUserAnswersForResult,
  insertDrillFromProblem,
} from '../../lib/fasttrackQueries'
import type { FasttrackProblemRow, FasttrackUserAnswerRow } from '../../types/fasttrack'
import { gradeLabel } from './mockDrillUtils'
import './MockExamResultPage.css'

export function MockExamResultPage() {
  const { examId = '', resultId = '' } = useParams()
  const navigate = useNavigate()
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchTestResult>>>(null)
  const [answers, setAnswers] = useState<FasttrackUserAnswerRow[]>([])
  const [problems, setProblems] = useState<Map<string, FasttrackProblemRow>>(new Map())
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [drillBusy, setDrillBusy] = useState<'upper' | 'lower' | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetchTestResult(resultId)
        const ans = await fetchUserAnswersForResult(resultId)
        if (cancelled) return
        setResult(r)
        setAnswers(ans)
        const ids = [...new Set(ans.map((a) => a.problem_id))]
        const pmap = await fetchProblemsByIds(ids)
        if (!cancelled) setProblems(pmap)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '로드 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resultId])

  const wrong = answers.filter((a) => !a.is_correct)

  async function startDrill(version: 'upper' | 'lower') {
    if (wrong.length === 0) return
    setDrillBusy(version)
    try {
      const newIds: string[] = []
      for (const a of wrong) {
        const row = await insertDrillFromProblem(a.problem_id, version)
        newIds.push(row.id)
      }
      const q = newIds.map(encodeURIComponent).join(',')
      navigate(`/study/mock-exam/drill?ids=${q}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '드릴 생성 실패')
    } finally {
      setDrillBusy(null)
    }
  }

  if (loading) return <div className="mock-result mock-result--centered">결과 불러오는 중…</div>
  if (err || !result)
    return (
      <div className="mock-result mock-result--centered">
        <p>{err ?? '결과 없음'}</p>
        <Link to="/study/mock-exam">홈으로</Link>
      </div>
    )

  return (
    <div className="mock-result">
      <header className="mock-result__head">
        <p className="mock-result__badge">모의고사 결과</p>
        <h1 className="mock-result__title">채점 완료</h1>
        <div className="mock-result__scorebox">
          <p className="mock-result__score">
            {result.score}점 <span className="mock-result__grade">({gradeLabel(result.score)})</span>
          </p>
          <p className="mock-result__meta">
            {result.correct_count} / {result.total_questions} 정답 · 소요 {Math.floor(result.time_spent_sec / 60)}분
          </p>
        </div>
        <p className="mock-result__fomo" role="note">
          동일 성적대 합격생 벤치마크는 곧 연동됩니다. (Confirmed_Data)
        </p>
      </header>

      <section className="mock-result__wrong" aria-label="오답 노트">
        <h2 className="mock-result__h2">오답 해설</h2>
        {wrong.length === 0 ? (
          <p className="mock-result__muted">전부 정답입니다.</p>
        ) : (
          <ul className="mock-result__list">
            {wrong
              .filter((a) => problems.has(a.problem_id))
              .map((a) => {
                const p = problems.get(a.problem_id)!
                return (
                  <li key={a.id} className="mock-result__item">
                    <ProblemRenderer
                      questionText={p.question_text}
                      passage={p.passage}
                      referenceView={p.reference_view}
                      choices={p.choices}
                      name={`review-${a.id}`}
                      value={a.user_answer}
                      onChange={() => {}}
                      disabled
                      showCorrect
                      correctAnswer={p.correct_answer}
                    />
                    <p className="mock-result__explain">
                      <strong>정답</strong> {p.correct_answer} ·{' '}
                      {p.explanation ?? '해설이 없습니다.'}
                    </p>
                  </li>
                )
              })}
          </ul>
        )}
      </section>

      <div className="mock-result__cta">
        <button
          type="button"
          className="mock-result__btn mock-result__btn--upper"
          disabled={wrong.length === 0 || drillBusy !== null}
          onClick={() => void startDrill('upper')}
        >
          {drillBusy === 'upper' ? '생성 중…' : '상위 드릴 시작'}
        </button>
        <button
          type="button"
          className="mock-result__btn mock-result__btn--lower"
          disabled={wrong.length === 0 || drillBusy !== null}
          onClick={() => void startDrill('lower')}
        >
          {drillBusy === 'lower' ? '생성 중…' : '하위 드릴 시작'}
        </button>
        <Link to="/d-agent/mh-chat" className="mock-result__btn mock-result__btn--agent">
          My Agent에게 물어보기
        </Link>
        <Link to={`/study/mock-exam/mock/${examId}`} className="mock-result__link">
          같은 시험 다시 보기
        </Link>
        <Link to="/study/mock-exam" className="mock-result__link">
          모의고사 홈
        </Link>
      </div>
    </div>
  )
}
