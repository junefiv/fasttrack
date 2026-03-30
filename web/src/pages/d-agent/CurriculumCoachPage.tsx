import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  aggregateStatsBySubject,
  demoPeerAdmissionStats,
  pickWeakChapters,
} from '../../lib/curriculumCoachDashboard'
import { loadCurriculumCoachProfile } from '../../lib/curriculumCoachProfile'
import {
  bankLeagueFromAccuracy,
  buildMockExamMatrix,
  demoPeerLectureMedianPercent,
  type MonthRound,
} from '../../lib/curriculumCoachStatus'
import { countWatchedSessions } from '../../lib/curriculumCoachWatch'
import {
  fetchAllMockTestScoresRaw,
  fetchChapterNamesMap,
  fetchLectureSessionCount,
  fetchMockExams,
  fetchMockTestResultsForUser,
  fetchStudentStatsForUser,
  fetchSubjects,
} from '../../lib/fasttrackQueries'
import { getFasttrackUserId } from '../../lib/fasttrackUser'
import './CurriculumCoachPage.css'

type DetailKey = 'mock' | 'bank' | 'lecture'

const ROUNDS: MonthRound[] = ['3', '6', '9']
const ROUND_LABEL: Record<MonthRound, string> = { '3': '3월', '6': '6월', '9': '9월' }

export function CurriculumCoachPage() {
  const userId = useMemo(() => getFasttrackUserId(), [])
  const [profile] = useState(() => loadCurriculumCoachProfile())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subjectSummaries, setSubjectSummaries] = useState<
    ReturnType<typeof aggregateStatsBySubject>
  >([])
  const [weakChapters, setWeakChapters] = useState<ReturnType<typeof pickWeakChapters>>([])
  const [mockMatrix, setMockMatrix] = useState<ReturnType<typeof buildMockExamMatrix> | null>(null)
  const [lectureSessionTotal, setLectureSessionTotal] = useState(0)
  const [watchedCount, setWatchedCount] = useState(0)
  const [expanded, setExpanded] = useState<DetailKey | null>(null)

  const peerDemo = useMemo(
    () => demoPeerAdmissionStats(profile.targetUniversity),
    [profile.targetUniversity],
  )

  const peerLectureMedian = useMemo(
    () => demoPeerLectureMedianPercent(profile.targetUniversity),
    [profile.targetUniversity],
  )

  const totals = useMemo(() => {
    let attempts = 0
    let correct = 0
    for (const s of subjectSummaries) {
      attempts += s.totalAttempts
      correct += s.correctCount
    }
    const acc = attempts > 0 ? Math.round((correct * 1000) / attempts) / 10 : null
    return { attempts, correct, acc }
  }, [subjectSummaries])

  const bankLeague = useMemo(() => bankLeagueFromAccuracy(totals.acc), [totals.acc])

  const lectureProgressPercent = useMemo(() => {
    if (lectureSessionTotal <= 0) return null
    return Math.round((watchedCount * 1000) / lectureSessionTotal) / 10
  }, [watchedCount, lectureSessionTotal])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [
        subjects,
        statRows,
        userMocks,
        allMockScores,
        mockExams,
        sessionCount,
      ] = await Promise.all([
        fetchSubjects(),
        fetchStudentStatsForUser(userId),
        fetchMockTestResultsForUser(userId),
        fetchAllMockTestScoresRaw(),
        fetchMockExams(),
        fetchLectureSessionCount(),
      ])

      const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]))
      const bySubject = aggregateStatsBySubject(statRows, subjectNameById)
      setSubjectSummaries(bySubject)

      const chapterIds = [...new Set(statRows.map((r) => r.chapter_id).filter(Boolean) as string[])]
      const chapterNameById = await fetchChapterNamesMap(chapterIds)
      setWeakChapters(pickWeakChapters(statRows, subjectNameById, chapterNameById, 8, 2))

      setMockMatrix(buildMockExamMatrix(subjects, mockExams, userMocks, allMockScores))
      setLectureSessionTotal(sessionCount)
      setWatchedCount(countWatchedSessions())
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.')
      setSubjectSummaries([])
      setWeakChapters([])
      setMockMatrix(null)
      setLectureSessionTotal(0)
      setWatchedCount(0)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleDetail = (key: DetailKey) => {
    setExpanded((prev) => (prev === key ? null : key))
  }

  const mockSummaryLine = useMemo(() => {
    if (!mockMatrix || mockMatrix.attemptCount === 0) {
      return '아직 모의고사 응시 기록이 없습니다.'
    }
    const p = mockMatrix.overallAvgPercentile
    return `누적 응시 ${mockMatrix.attemptCount}회 · 평균 상위 ${p !== null ? `${p}%` : '—'} (응시한 시험 기준)`
  }, [mockMatrix])

  return (
    <div className="curriculum-coach">
      <header className="curriculum-coach__header">
        <p className="curriculum-coach__label">D-Agent</p>
        <h1 className="curriculum-coach__title">커리큘럼 코치</h1>
        <p className="curriculum-coach__subtitle">
          목표 대학 기준 학습 네비게이터 — 나의 현황과 선배 풀 지표를 한눈에 봅니다.
        </p>
      </header>

      <section className="curriculum-coach__section" aria-labelledby="curriculum-peer-heading">
        <h2 id="curriculum-peer-heading" className="curriculum-coach__section-title">
          목표 대학 · 선배 풀
        </h2>
        <div className="curriculum-coach__peer-grid">
          <article className="curriculum-coach__card curriculum-coach__card--goal">
            <p className="curriculum-coach__card-kicker">목표 대학</p>
            <p className="curriculum-coach__card-value">{profile.targetUniversity}</p>
            <p className="curriculum-coach__card-kicker curriculum-coach__card-kicker--spaced">
              이전 목표 대학
            </p>
            <p className="curriculum-coach__card-value curriculum-coach__card-value--secondary">
              {profile.previousTargetUniversity}
            </p>
          </article>
          <article className="curriculum-coach__card">
            <p className="curriculum-coach__card-kicker">목표 대학 진학 선배 (전체)</p>
            <p className="curriculum-coach__stat-num">{peerDemo.totalEnteredTarget.toLocaleString()}</p>
            <p className="curriculum-coach__card-note">명 · 플랫폼 집계 데모 지표</p>
          </article>
          <article className="curriculum-coach__card">
            <p className="curriculum-coach__card-kicker">나와 비슷한 수준에서 목표 대학 진학</p>
            <p className="curriculum-coach__stat-num">
              {peerDemo.similarLevelEnteredTarget.toLocaleString()}
            </p>
            <p className="curriculum-coach__card-note">
              명 · 성적 밴드 유사 집단 데모(실서비스 시 모델·공식 데이터로 대체)
            </p>
          </article>
        </div>
      </section>

      <section className="curriculum-coach__section" aria-labelledby="curriculum-status-heading">
        <div className="curriculum-coach__section-head">
          <h2 id="curriculum-status-heading" className="curriculum-coach__section-title">
            나의 현황
          </h2>
          <button type="button" className="curriculum-coach__refresh" onClick={() => void load()}>
            새로고침
          </button>
        </div>

        {error ? (
          <p className="curriculum-coach__error" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="curriculum-coach__muted">불러오는 중…</p>
        ) : (
          <div className="curriculum-coach__status-row">
            <article className="curriculum-coach__status-card">
              <h3 className="curriculum-coach__status-card-title">모의고사</h3>
              <p className="curriculum-coach__status-card-desc">
                국어·영어·수학별 3·6·9월 및 제공 시험 대비 내 점수·상위 백분위
              </p>
              <p className="curriculum-coach__status-card-metric">{mockSummaryLine}</p>
              <button
                type="button"
                className="curriculum-coach__detail-btn"
                aria-expanded={expanded === 'mock'}
                onClick={() => toggleDetail('mock')}
              >
                {expanded === 'mock' ? '접기' : '자세히 보기'}
              </button>
              {expanded === 'mock' && mockMatrix ? (
                <div className="curriculum-coach__detail-panel" role="region" aria-label="모의고사 상세">
                  <p className="curriculum-coach__detail-lead">
                    시험 시행 월(응시일 기준)과 과목으로 묶었습니다. 동일 칸에 여러 시험이 있으면 백분위는
                    평균입니다.
                  </p>
                  <div className="curriculum-coach__matrix-wrap">
                    <table className="curriculum-coach__matrix">
                      <thead>
                        <tr>
                          <th scope="col">과목</th>
                          {ROUNDS.map((r) => (
                            <th key={r} scope="col">
                              {ROUND_LABEL[r]} 모의
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mockMatrix.rows.map((row) => (
                          <tr key={row.pillar}>
                            <th scope="row">{row.pillar}</th>
                            {ROUNDS.map((r) => {
                              const c = row.cells[r]
                              const show =
                                c.myBestScore !== null
                                  ? `${c.myBestScore}점 · 상위 ${c.percentile ?? '—'}%`
                                  : c.examNames.length
                                    ? '미응시'
                                    : '—'
                              return (
                                <td key={r}>
                                  <span className="curriculum-coach__matrix-cell">{show}</span>
                                  {c.examNames.length > 0 ? (
                                    <span className="curriculum-coach__matrix-sub">
                                      {c.examNames.slice(0, 2).join(', ')}
                                      {c.examNames.length > 2 ? '…' : ''}
                                    </span>
                                  ) : null}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {mockMatrix.rows.some((r) => r.otherExams.length > 0) ? (
                    <>
                      <h4 className="curriculum-coach__detail-subtitle">그 외 제공 모의고사</h4>
                      <ul className="curriculum-coach__detail-list">
                        {mockMatrix.rows.flatMap((row) =>
                          row.otherExams.map((o) => (
                            <li key={o.examId}>
                              <strong>{row.pillar}</strong> · {o.name}:{' '}
                              {o.myScore !== null
                                ? `${o.myScore}점 · 상위 ${o.percentile ?? '—'}%`
                                : '미응시'}
                            </li>
                          )),
                        )}
                      </ul>
                    </>
                  ) : null}
                  <p className="curriculum-coach__detail-foot">
                    백분위는 동일 시험(reference) 전체 응시 로그 기준입니다. 데이터가 적으면 변동이 큽니다.
                  </p>
                </div>
              ) : null}
            </article>

            <article className="curriculum-coach__status-card">
              <h3 className="curriculum-coach__status-card-title">문제은행</h3>
              <p className="curriculum-coach__status-card-desc">
                누적 정답률 기준 리그 내 순위 (문제은행·드릴 통계 합산)
              </p>
              {totals.attempts === 0 ? (
                <p className="curriculum-coach__status-card-metric">
                  아직 문제은행·드릴 풀이 통계가 없습니다.
                </p>
              ) : (
                <>
                  <p className="curriculum-coach__status-card-metric">
                    {bankLeague.leagueName}
                    {bankLeague.leagueSize > 0
                      ? ` · ${bankLeague.rank.toLocaleString()} / ${bankLeague.leagueSize.toLocaleString()}위`
                      : ''}
                  </p>
                  <p className="curriculum-coach__status-card-sub">
                    정답률 <strong>{totals.acc}%</strong> ({totals.correct.toLocaleString()} /{' '}
                    {totals.attempts.toLocaleString()}문항)
                  </p>
                </>
              )}
              <button
                type="button"
                className="curriculum-coach__detail-btn"
                aria-expanded={expanded === 'bank'}
                onClick={() => toggleDetail('bank')}
              >
                {expanded === 'bank' ? '접기' : '자세히 보기'}
              </button>
              {expanded === 'bank' ? (
                <div className="curriculum-coach__detail-panel" role="region" aria-label="문제은행 상세">
                  <h4 className="curriculum-coach__detail-subtitle">과목별 정답률·풀이량</h4>
                  {subjectSummaries.length === 0 ? (
                    <p className="curriculum-coach__detail-muted">집계된 과목 데이터가 없습니다.</p>
                  ) : (
                    <ul className="curriculum-coach__detail-list">
                      {subjectSummaries.map((s) => (
                        <li key={s.subjectId}>
                          <strong>{s.subjectName}</strong>: 정답률 {s.accuracyPercent ?? '—'}% ·{' '}
                          {s.totalAttempts.toLocaleString()}문항
                        </li>
                      ))}
                    </ul>
                  )}
                  <h4 className="curriculum-coach__detail-subtitle">취약 챕터 (정답률 낮은 순)</h4>
                  {weakChapters.length === 0 ? (
                    <p className="curriculum-coach__detail-muted">
                      챕터별 충분한 풀이 후 표시됩니다.
                    </p>
                  ) : (
                    <ul className="curriculum-coach__detail-list">
                      {weakChapters.slice(0, 6).map((w) => (
                        <li key={`${w.subjectId}-${w.chapterId}`}>
                          {w.subjectName} · {w.chapterName}: {w.accuracyPercent}% (
                          {w.correctCount}/{w.totalAttempts})
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="curriculum-coach__detail-foot">
                    리그·순위는 정답률 구간별 데모 코호트입니다. 실서비스에서는 동일 리그 사용자 집단과
                    동기화됩니다.
                  </p>
                </div>
              ) : null}
            </article>

            <article className="curriculum-coach__status-card">
              <h3 className="curriculum-coach__status-card-title">수강률</h3>
              <p className="curriculum-coach__status-card-desc">
                같은 목표를 가졌던 선배들의 &apos;동월동일&apos; 수강 진행률 대비 나의 진행
              </p>
              <p className="curriculum-coach__status-card-metric">
                {lectureProgressPercent !== null
                  ? `나의 진행 ${lectureProgressPercent}% (시청 표시 ${watchedCount} / 전체 세션 ${lectureSessionTotal})`
                  : '전체 인강 세션 수를 불러오지 못했습니다.'}
              </p>
              <p className="curriculum-coach__status-card-sub">
                동월동일 선배 중앙값 <strong>{peerLectureMedian}%</strong> (데모 · 목표 대학·일자 기반)
              </p>
              <button
                type="button"
                className="curriculum-coach__detail-btn"
                aria-expanded={expanded === 'lecture'}
                onClick={() => toggleDetail('lecture')}
              >
                {expanded === 'lecture' ? '접기' : '자세히 보기'}
              </button>
              {expanded === 'lecture' ? (
                <div className="curriculum-coach__detail-panel" role="region" aria-label="수강률 상세">
                  <ul className="curriculum-coach__detail-list curriculum-coach__detail-list--plain">
                    <li>
                      <strong>분자</strong>: 브라우저에 저장된 시청 완료 세션 수(추후 플랫폼 로그와 연동
                      예정)
                    </li>
                    <li>
                      <strong>분모</strong>: DB에 등록된 전체 강의 세션 수 ({lectureSessionTotal})
                    </li>
                    <li>
                      <strong>선배 중앙값</strong>: 목표 대학 동일 코호트의 과거 동일 월·일 기준 진행률
                      분포 데모값
                    </li>
                    <li>
                      <strong>갭</strong>:{' '}
                      {lectureProgressPercent !== null
                        ? `${(peerLectureMedian - lectureProgressPercent).toFixed(1)}%p (선배 중앙 − 나)`
                        : '진행률 산출 후 표시'}
                    </li>
                  </ul>
                  <p className="curriculum-coach__detail-foot">
                    인강 플레이어와 연동하면 시청 구간·완료가 자동 반영되도록 확장할 수 있습니다.
                  </p>
                </div>
              ) : null}
            </article>
          </div>
        )}
      </section>
    </div>
  )
}
