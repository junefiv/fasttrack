import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  aggregateStatsBySubject,
  demoPeerAdmissionStats,
  pickWeakChapters,
} from '../../lib/curriculumCoachDashboard'
import { loadCurriculumCoachProfile } from '../../lib/curriculumCoachProfile'
import {
  aggregateMockCatalogPillarTotals,
  bankLeagueFromAccuracy,
  buildMockCatalogAccuracyBars,
  demoPeerLectureMedianPercent,
  formatMockCatalogPillarSummaryLine,
  MOCK_CATALOG_PILLAR_SECTION_ORDER,
  type MockCatalogAccuracyBar,
  type MockSummaryPillar,
} from '../../lib/curriculumCoachStatus'
import { countWatchedSessions } from '../../lib/curriculumCoachWatch'
import {
  groupMockProblemsByCatalog,
  inferStrengthWeaknessFromRollups,
  rollupMockProblemsByCategory,
  rollupMockProblemsByTag,
} from '../../lib/curriculumCoachMockInsights'
import {
  fetchCatalogMockCoachBundleForUser,
  fetchChapterNamesMap,
  fetchLectureSessionCount,
  fetchStudentStatsForUser,
  fetchSubjects,
  type CatalogMockProblemLatestRow,
} from '../../lib/fasttrackQueries'
import {
  analyzeMockCoachSnapshotWithGemini,
  buildMockCoachAnalysisPayload,
} from '../../lib/geminiMockCoachAnalysis'
import { getFasttrackUserId } from '../../lib/fasttrackUser'
import { messageFromUnknownError } from '../../lib/unknownError'
import './CurriculumCoachPage.css'

type DetailKey = 'mock' | 'bank' | 'lecture'

const MOCK_DONUT_SIZE = 76
const MOCK_DONUT_STROKE = 7

function MockPillarDonut({
  pillar,
  correct,
  total,
}: {
  pillar: MockSummaryPillar
  correct: number
  total: number
}) {
  const size = MOCK_DONUT_SIZE
  const stroke = MOCK_DONUT_STROKE
  const r = (size - stroke) / 2 - 1
  const circumference = 2 * Math.PI * r
  const frac = total > 0 ? correct / total : 0
  const dash = frac * circumference
  const pctText =
    total > 0 ? `${Math.round((correct * 1000) / total) / 10}%` : '—'
  const aria =
    total > 0
      ? `${pillar} 누적 정답률 ${pctText}, ${correct}문항 맞춤 전체 ${total}문항`
      : `${pillar}, 제출 없음`

  return (
    <article className="curriculum-coach__mock-donut" aria-label={aria}>
      <div className="curriculum-coach__mock-donut-ring">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="curriculum-coach__mock-donut-svg"
          aria-hidden
        >
          <g transform={`translate(${size / 2} ${size / 2})`}>
            <circle
              r={r}
              className="curriculum-coach__mock-donut-track"
              fill="none"
              strokeWidth={stroke}
            />
            {total > 0 ? (
              <circle
                r={r}
                className="curriculum-coach__mock-donut-fill"
                fill="none"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
                transform="rotate(-90)"
              />
            ) : null}
          </g>
        </svg>
        <span className="curriculum-coach__mock-donut-pct" aria-hidden>
          {pctText}
        </span>
      </div>
      <span className="curriculum-coach__mock-donut-name">{pillar}</span>
      <span className="curriculum-coach__mock-donut-meta">
        {total > 0 ? `${correct}/${total}` : '제출 없음'}
      </span>
    </article>
  )
}

export function CurriculumCoachPage() {
  const userId = useMemo(() => getFasttrackUserId(), [])
  const [profile] = useState(() => loadCurriculumCoachProfile())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subjectSummaries, setSubjectSummaries] = useState<
    ReturnType<typeof aggregateStatsBySubject>
  >([])
  const [weakChapters, setWeakChapters] = useState<ReturnType<typeof pickWeakChapters>>([])
  const [catalogMockDashboard, setCatalogMockDashboard] = useState<
    Awaited<ReturnType<typeof fetchCatalogMockCoachBundleForUser>>['dashboard']
  >([])
  const [mockProblemLatest, setMockProblemLatest] = useState<CatalogMockProblemLatestRow[]>([])
  const [mockCatalogAccuracy, setMockCatalogAccuracy] = useState<MockCatalogAccuracyBar[]>([])
  const [lectureSessionTotal, setLectureSessionTotal] = useState(0)
  const [watchedCount, setWatchedCount] = useState(0)
  const [expanded, setExpanded] = useState<DetailKey | null>(null)
  const [mockAiAnalysis, setMockAiAnalysis] = useState<string | null>(null)
  const [mockAiLoading, setMockAiLoading] = useState(false)
  const [mockAiError, setMockAiError] = useState<string | null>(null)

  const geminiApiKey = useMemo(() => import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? '', [])

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
    setMockAiAnalysis(null)
    setMockAiError(null)
    try {
      const [subjects, statRows, sessionCount] = await Promise.all([
        fetchSubjects(),
        fetchStudentStatsForUser(userId),
        fetchLectureSessionCount(),
      ])

      const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]))
      const bySubject = aggregateStatsBySubject(statRows, subjectNameById)
      setSubjectSummaries(bySubject)

      const chapterIds = [...new Set(statRows.map((r) => r.chapter_id).filter(Boolean) as string[])]
      const chapterNameById = await fetchChapterNamesMap(chapterIds)
      setWeakChapters(pickWeakChapters(statRows, subjectNameById, chapterNameById, 8, 2))

      let catalogDashboard: Awaited<ReturnType<typeof fetchCatalogMockCoachBundleForUser>>['dashboard'] =
        []
      let problemLatest: CatalogMockProblemLatestRow[] = []
      try {
        const bundle = await fetchCatalogMockCoachBundleForUser(userId)
        catalogDashboard = bundle.dashboard
        problemLatest = bundle.problemLatest
      } catch (catErr) {
        console.error('[CurriculumCoach] 카탈로그 모의고사 집계만 실패 (나머지 현황은 유지)', {
          message: messageFromUnknownError(catErr),
          userId,
          raw: catErr,
        })
      }
      setCatalogMockDashboard(catalogDashboard)
      setMockProblemLatest(problemLatest)
      setMockCatalogAccuracy(
        buildMockCatalogAccuracyBars(
          subjects,
          catalogDashboard.map((r) => ({
            catalogId: r.catalogId,
            title: r.title,
            subject_id: r.subject_id,
            correct: r.submissionsCorrect,
            total: r.submissionsTotal,
          })),
        ),
      )
      setLectureSessionTotal(sessionCount)
      setWatchedCount(countWatchedSessions())
    } catch (e) {
      const msg = messageFromUnknownError(e)
      console.error('[CurriculumCoach] load failed — 나의 현황 로드 중단', {
        message: msg,
        userId,
        raw: e,
        stack: e instanceof Error ? e.stack : undefined,
      })
      setError(msg || '데이터를 불러오지 못했습니다.')
      setSubjectSummaries([])
      setWeakChapters([])
      setCatalogMockDashboard([])
      setMockProblemLatest([])
      setMockCatalogAccuracy([])
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

  const mockSummaryLine = useMemo(
    () => formatMockCatalogPillarSummaryLine(mockCatalogAccuracy),
    [mockCatalogAccuracy],
  )

  const mockPillarAgg = useMemo(
    () => aggregateMockCatalogPillarTotals(mockCatalogAccuracy),
    [mockCatalogAccuracy],
  )

  const mockPillarDonutOrder = useMemo((): MockSummaryPillar[] => {
    const order: MockSummaryPillar[] = [...MOCK_CATALOG_PILLAR_SECTION_ORDER]
    if (mockPillarAgg.기타.total > 0) order.push('기타')
    return order
  }, [mockPillarAgg])

  const mockHasCatalogSubmissions = useMemo(
    () => mockCatalogAccuracy.reduce((s, b) => s + b.total, 0) > 0,
    [mockCatalogAccuracy],
  )

  const subjectLabelById = useMemo(
    () => new Map(subjectSummaries.map((s) => [s.subjectId, s.subjectName])),
    [subjectSummaries],
  )

  const mockCategoryRollups = useMemo(
    () => rollupMockProblemsByCategory(mockProblemLatest),
    [mockProblemLatest],
  )
  const mockTagRollups = useMemo(() => rollupMockProblemsByTag(mockProblemLatest), [mockProblemLatest])

  const mockCategorySW = useMemo(
    () => inferStrengthWeaknessFromRollups(mockCategoryRollups),
    [mockCategoryRollups],
  )
  const mockTagSW = useMemo(
    () => inferStrengthWeaknessFromRollups(mockTagRollups),
    [mockTagRollups],
  )

  const mockProblemGroups = useMemo(
    () => groupMockProblemsByCatalog(mockProblemLatest),
    [mockProblemLatest],
  )

  const mockAccuracySections = useMemo(() => {
    if (mockCatalogAccuracy.length === 0) return []
    const map = new Map<string, MockCatalogAccuracyBar[]>()
    for (const bar of mockCatalogAccuracy) {
      const key = bar.pillar ?? bar.pillarLabel
      const arr = map.get(key) ?? []
      arr.push(bar)
      map.set(key, arr)
    }
    const sections: { heading: string; bars: MockCatalogAccuracyBar[] }[] = []
    const seen = new Set<string>()
    for (const h of MOCK_CATALOG_PILLAR_SECTION_ORDER) {
      const b = map.get(h)
      if (b?.length) {
        sections.push({ heading: h, bars: b })
        seen.add(h)
      }
    }
    for (const [h, bars] of map) {
      if (!seen.has(h)) sections.push({ heading: h, bars })
    }
    return sections
  }, [mockCatalogAccuracy])

  const mockAnalysisPayload = useMemo(() => {
    if (catalogMockDashboard.length === 0 && mockProblemLatest.length === 0) return null
    return buildMockCoachAnalysisPayload({
      summaryLine: mockSummaryLine,
      mockAccuracySections,
      categoryRollups: mockCategoryRollups,
      tagRollups: mockTagRollups,
      categorySW: mockCategorySW,
      tagSW: mockTagSW,
      problemGroups: mockProblemGroups,
      subjectLabelById,
    })
  }, [
    catalogMockDashboard,
    mockSummaryLine,
    mockAccuracySections,
    mockCategoryRollups,
    mockTagRollups,
    mockCategorySW,
    mockTagSW,
    mockProblemGroups,
    subjectLabelById,
    mockProblemLatest,
  ])

  const runMockGeminiAnalysis = useCallback(async () => {
    if (!geminiApiKey) {
      setMockAiError('VITE_GEMINI_API_KEY 가 web/.env 에 설정되어 있는지 확인하세요.')
      return
    }
    const payload = mockAnalysisPayload
    if (!payload) return
    setMockAiLoading(true)
    setMockAiError(null)
    try {
      const text = await analyzeMockCoachSnapshotWithGemini({ apiKey: geminiApiKey, payload })
      setMockAiAnalysis(text)
    } catch (e) {
      setMockAiAnalysis(null)
      setMockAiError(messageFromUnknownError(e))
    } finally {
      setMockAiLoading(false)
    }
  }, [geminiApiKey, mockAnalysisPayload])

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
                카탈로그 시험(시리즈)별 누적 제출 정답률과 요약 지표
              </p>
              {mockHasCatalogSubmissions ? (
                <div
                  className="curriculum-coach__mock-donut-row"
                  role="list"
                  aria-label="과목별 누적 제출 정답률"
                >
                  {mockPillarDonutOrder.map((pillar) => (
                    <div key={pillar} className="curriculum-coach__mock-donut-cell" role="listitem">
                      <MockPillarDonut
                        pillar={pillar}
                        correct={mockPillarAgg[pillar].correct}
                        total={mockPillarAgg[pillar].total}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="curriculum-coach__status-card-metric">
                  아직 카탈로그 모의고사 문항 제출 기록이 없습니다.
                </p>
              )}
              <button
                type="button"
                className="curriculum-coach__detail-btn"
                aria-expanded={expanded === 'mock'}
                onClick={() => toggleDetail('mock')}
              >
                {expanded === 'mock' ? '접기' : '자세히 보기'}
              </button>
              {expanded === 'mock' ? (
                <div className="curriculum-coach__detail-panel" role="region" aria-label="모의고사 상세">
                  <div className="curriculum-coach__mock-ai" aria-label="Gemini 모의고사 해석">
                    
                    <div className="curriculum-coach__mock-ai-actions">
                      <button
                        type="button"
                        className="curriculum-coach__mock-ai-btn"
                        disabled={!mockAnalysisPayload || mockAiLoading}
                        onClick={() => void runMockGeminiAnalysis()}
                      >
                        {mockAiLoading ? '분석 중…' : '강점·취약점 분석 요청'}
                      </button>
                      {!geminiApiKey ? (
                        <span className="curriculum-coach__detail-muted curriculum-coach__mock-ai-hint">
                          API 키가 없어 요청할 수 없습니다.
                        </span>
                      ) : null}
                    </div>
                    {mockAiError ? (
                      <p className="curriculum-coach__error curriculum-coach__mock-ai-error" role="alert">
                        {mockAiError}
                      </p>
                    ) : null}
                    {mockAiAnalysis ? (
                      <pre className="curriculum-coach__mock-ai-output">{mockAiAnalysis}</pre>
                    ) : null}
                  </div>
                  
                  <h4 className="curriculum-coach__detail-subtitle curriculum-coach__detail-subtitle--chart">
                    과목 · 시험별 문항 정답률 (누적 제출 건수 기준)
                  </h4>
                  <p className="curriculum-coach__detail-lead curriculum-coach__detail-lead--tight">
                    동일 문항을 여러 번 제출하면 건수만큼 반영됩니다.
                  </p>
                  {mockAccuracySections.length === 0 ? (
                    <p className="curriculum-coach__detail-muted">
                      카탈로그 문항 제출 기록이 없으면 차트가 비어 있습니다.
                    </p>
                  ) : (
                    <div
                      className="curriculum-coach__acc-chart"
                      role="region"
                      aria-label="과목 및 시험 시리즈별 정답률"
                    >
                      {mockAccuracySections.map((sec) => (
                        <div key={sec.heading} className="curriculum-coach__acc-pillar-block">
                          <h5 className="curriculum-coach__acc-pillar-heading">{sec.heading}</h5>
                          <ul className="curriculum-coach__acc-bar-list">
                            {sec.bars.map((bar) => (
                              <li key={bar.catalogId} className="curriculum-coach__acc-bar-item">
                                <div className="curriculum-coach__acc-bar-label">
                                  <span className="curriculum-coach__acc-bar-title">{bar.examLabel}</span>
                                  <span className="curriculum-coach__acc-bar-stat" aria-hidden>
                                    {bar.accuracyPercent}% · {bar.correct}/{bar.total}문항
                                  </span>
                                </div>
                                <div
                                  className="curriculum-coach__acc-bar-track"
                                  role="img"
                                  aria-label={`${sec.heading} ${bar.examLabel} 정답률 ${bar.accuracyPercent}퍼센트, ${bar.correct}개 맞춤 전체 ${bar.total}문항`}
                                >
                                  <div
                                    className="curriculum-coach__acc-bar-fill"
                                    style={{ width: `${Math.min(100, bar.accuracyPercent)}%` }}
                                  />
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  

                  
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
