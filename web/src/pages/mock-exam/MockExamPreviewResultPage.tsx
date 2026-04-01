import { Anchor, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ProblemRenderer } from '../../components/ProblemRenderer'
import {
  catalogCaptionWatchPath,
  catalogEbookPageWatchPath,
  fetchCatalogProblemLearningLinksMerged,
  fetchEbookPageNavContexts,
  fetchLectureCaptionNavContexts,
} from '../../lib/fasttrackQueries'
import { formatTimestamp } from '../../lib/formatTime'
import type {
  CatalogEbookPageNavContext,
  CatalogLectureCaptionNavContext,
  CatalogProblemLearningDeepLink,
  FasttrackUserAnswerRow,
} from '../../types/fasttrack'
import {
  isMockExamPreviewResultState,
  type MockExamPreviewResultSheet,
} from '../../types/mockExamPreviewResult'
import { gradeLabel } from './mockDrillUtils'
import './MockExamResultPage.css'

function buildLearningWatchPath(dl: CatalogProblemLearningDeepLink): string {
  const q = new URLSearchParams()
  q.set('t', String(dl.caption_start_sec))
  q.set('ebook', '1')
  if (dl.resource_id) {
    q.set('resourceId', dl.resource_id)
    q.set('page', String(dl.ebook_page_number))
  }
  return `/study/videos/watch/${dl.lecture_session_id}?${q.toString()}`
}

function ebookNavButtonLabel(ctx: CatalogEbookPageNavContext): string {
  const lec = (ctx.lecture_title || '강의').trim()
  const res = (ctx.resource_title || '교재').trim()
  return `${lec} › ${res} › p.${ctx.page_number}`
}

function captionNavButtonLabel(ctx: CatalogLectureCaptionNavContext): string {
  const lec = (ctx.lecture_title || '강의').trim()
  const ord = ctx.session_order > 0 ? ctx.session_order : null
  const ses = (ctx.session_title || (ord != null ? `회차 ${ord}` : '회차')).trim()
  return `${lec} › ${ses} · ${formatTimestamp(ctx.start_sec)}`
}

export function MockExamPreviewResultPage() {
  const { catalogId = '' } = useParams<{ catalogId: string }>()
  const location = useLocation()
  const state = isMockExamPreviewResultState(location.state) ? location.state : null

  const [deepLinks, setDeepLinks] = useState<Map<string, CatalogProblemLearningDeepLink>>(new Map())
  const [ebookNavByPageId, setEbookNavByPageId] = useState<Map<string, CatalogEbookPageNavContext>>(new Map())
  const [capNavById, setCapNavById] = useState<Map<string, CatalogLectureCaptionNavContext>>(new Map())

  const syntheticAnswers: FasttrackUserAnswerRow[] = useMemo(() => {
    if (!state) return []
    return state.sheets.map((s) => {
      const ua = (state.answers[s.id] ?? '').trim()
      const ok = ua === String(s.correct_answer).trim()
      return {
        id: `preview-${s.id}`,
        user_id: '',
        result_id: '',
        problem_id: s.id,
        is_mock: true,
        user_answer: ua || '(미응답)',
        is_correct: ok,
      }
    })
  }, [state])

  const scoreMeta = useMemo(() => {
    if (!state) return null
    const total = state.sheets.length
    let correct = 0
    for (const s of state.sheets) {
      const ua = (state.answers[s.id] ?? '').trim()
      if (ua === String(s.correct_answer).trim()) correct += 1
    }
    const score = total > 0 ? Math.round((correct * 100) / total) : 0
    return { correct, total, score, timeSpentSec: state.timeSpentSec, examName: state.examName }
  }, [state])

  useEffect(() => {
    if (!state?.sheets.length) return
    let cancelled = false
    const ids = state.sheets.map((s) => s.id)
    const eb = new Set<string>()
    const cp = new Set<string>()
    for (const s of state.sheets) {
      if (s.ebook_page_id?.trim()) eb.add(s.ebook_page_id.trim())
      if (s.lecture_caption_id?.trim()) cp.add(s.lecture_caption_id.trim())
    }
    void (async () => {
      try {
        const [m, em, cm] = await Promise.all([
          fetchCatalogProblemLearningLinksMerged(ids),
          fetchEbookPageNavContexts([...eb]),
          fetchLectureCaptionNavContexts([...cp]),
        ])
        if (!cancelled) {
          setDeepLinks(m)
          setEbookNavByPageId(em)
          setCapNavById(cm)
        }
      } catch {
        if (!cancelled) {
          setDeepLinks(new Map())
          setEbookNavByPageId(new Map())
          setCapNavById(new Map())
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state])

  const sortedAnswers = useMemo(() => {
    return [...syntheticAnswers].sort((a, b) => {
      const sa = state?.sheets.find((x) => x.id === a.problem_id)
      const sb = state?.sheets.find((x) => x.id === b.problem_id)
      const pa = sa?.question_number ?? 0
      const pb = sb?.question_number ?? 0
      if (pa !== pb) return pa - pb
      return a.problem_id.localeCompare(b.problem_id)
    })
  }, [syntheticAnswers, state])

  const wrong = syntheticAnswers.filter((a) => !a.is_correct)
  const sheetById = useMemo(() => {
    const m = new Map<string, MockExamPreviewResultSheet>()
    if (state) for (const s of state.sheets) m.set(s.id, s)
    return m
  }, [state])

  if (!state || !scoreMeta) {
    return (
      <div className="mock-result mock-result--centered">
        <p>미리보기 결과 정보가 없습니다. 시험을 마친 뒤 이 페이지로 이동하거나, 목록에서 다시 응시해 주세요.</p>
        <Link to="/study/mock-exam">모의고사 홈</Link>
      </div>
    )
  }

  return (
    <div className="mock-result">
      <header className="mock-result__head">
        <p className="mock-result__badge">미리보기 결과</p>
        <h1 className="mock-result__title">{scoreMeta.examName}</h1>
        <div className="mock-result__scorebox">
          <p className="mock-result__score">
            {scoreMeta.score}점 <span className="mock-result__grade">({gradeLabel(scoreMeta.score)})</span>
          </p>
          <p className="mock-result__meta">
            {scoreMeta.correct} / {scoreMeta.total} 정답 · 소요 {Math.floor(scoreMeta.timeSpentSec / 60)}분
          </p>
        </div>
        <p className="mock-result__fomo" role="note">
          미리보기는 DB에 응시 기록을 남기지 않습니다. 새로고침하면 이 화면을 다시 열 수 없을 수 있습니다.
        </p>
      </header>

      <section className="mock-result__navigator" aria-label="선제적 학습 경로">
        <h2 className="mock-result__h2">문항별 강의·교재로 이어가기</h2>
        <p className="mock-result__nav-lead">
          정답·오답과 관계없이, 카탈로그에 연결된 교재 페이지·자막 시각으로 각각 이동할 수 있습니다. 교재와 자막이 같은
          회차일 때만 &quot;강의·교재 열기&quot; 통합 링크가 표시됩니다.
        </p>
        <Stack gap="sm">
          {sortedAnswers.map((a) => {
            const s = sheetById.get(a.problem_id)
            const n = s?.question_number && s.question_number > 0 ? s.question_number : null
            const label = n != null ? `문항 ${n}` : `문항 ${a.problem_id.slice(0, 8)}…`
            const dl = deepLinks.get(a.problem_id)
            const ebId = s?.ebook_page_id?.trim() ?? ''
            const capId = s?.lecture_caption_id?.trim() ?? ''
            const ebookCtx = ebId ? ebookNavByPageId.get(ebId.toLowerCase()) : undefined
            const capCtx = capId ? capNavById.get(capId) : undefined
            const hasAnyRef = Boolean(ebId || capId)
            return (
              <Paper key={a.id} withBorder p="md" radius="md" className="mock-result__nav-card">
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                  <Stack gap={4} style={{ flex: 1, minWidth: 200 }}>
                    <Group gap="xs">
                      <Text fw={600} size="sm">
                        {label}
                      </Text>
                      <Badge size="sm" color={a.is_correct ? 'teal' : 'red'} variant="light">
                        {a.is_correct ? '정답' : '오답'}
                      </Badge>
                    </Group>
                    {dl ? (
                      <>
                        <Text size="xs" c="dimmed">
                          재생 시각 {formatTimestamp(dl.caption_start_sec)}
                        </Text>
                        {dl.resource_id ? (
                          <Text size="xs" c="dimmed">
                            교재 PDF p.{dl.ebook_page_number}
                          </Text>
                        ) : (
                          <Text size="xs" c="dimmed">
                            교재 페이지 번호는 리소스 연결 후 표시됩니다.
                          </Text>
                        )}
                      </>
                    ) : hasAnyRef ? (
                      <Text size="xs" c="dimmed">
                        교재·자막이 서로 다른 회차이면 통합 링크는 없습니다. 오른쪽 버튼으로 각 회차로 이동하세요.
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        카탈로그 문항에 교재·자막 ID가 없습니다.
                      </Text>
                    )}
                  </Stack>
                  <Stack gap="xs" align="flex-end" style={{ minWidth: 200 }}>
                    {ebookCtx ? (
                      <Button
                        component={Link}
                        to={catalogEbookPageWatchPath(ebookCtx)}
                        size="xs"
                        variant="light"
                        fullWidth
                      >
                        {ebookNavButtonLabel(ebookCtx)}
                      </Button>
                    ) : ebId ? (
                      <Text size="xs" c="dimmed" ta="right">
                        교재 페이지 정보를 찾을 수 없습니다.
                      </Text>
                    ) : null}
                    {capCtx ? (
                      <Button
                        component={Link}
                        to={catalogCaptionWatchPath(capCtx)}
                        size="xs"
                        variant="light"
                        fullWidth
                      >
                        {captionNavButtonLabel(capCtx)}
                      </Button>
                    ) : capId ? (
                      <Text size="xs" c="dimmed" ta="right">
                        자막·회차 정보를 찾을 수 없습니다.
                      </Text>
                    ) : null}
                    {dl ? (
                      <Anchor component={Link} to={buildLearningWatchPath(dl)} size="sm" fw={600}>
                        강의·교재 열기 (통합)
                      </Anchor>
                    ) : null}
                  </Stack>
                </Group>
              </Paper>
            )
          })}
        </Stack>
      </section>

      <section className="mock-result__wrong" aria-label="오답 노트">
        <h2 className="mock-result__h2">오답 해설</h2>
        {wrong.length === 0 ? (
          <p className="mock-result__muted">전부 정답입니다.</p>
        ) : (
          <ul className="mock-result__list">
            {wrong
              .filter((a) => sheetById.has(a.problem_id))
              .map((a) => {
                const s = sheetById.get(a.problem_id)!
                return (
                  <li key={a.id} className="mock-result__item">
                    <ProblemRenderer
                      instructionText={s.instruction}
                      problemNumber={s.question_number > 0 ? s.question_number : undefined}
                      questionText=""
                      readingBody={s.reading_body}
                      suppressReadingBody={false}
                      readingDiagram={s.diagram}
                      readingDiagramUrl={s.diagram_url}
                      passage={s.passage}
                      choices={s.options}
                      name={`preview-review-${a.id}`}
                      value={a.user_answer}
                      onChange={() => {}}
                      disabled
                      showCorrect
                      correctAnswer={s.correct_answer}
                    />
                    <p className="mock-result__explain">
                      <strong>정답</strong> {s.correct_answer} ·{' '}
                      {s.explanation?.trim() ? s.explanation : '해설이 없습니다.'}
                    </p>
                  </li>
                )
              })}
          </ul>
        )}
      </section>

      <div className="mock-result__cta">
        <Link to={`/study/mock-exam/preview/${catalogId}`} className="mock-result__btn mock-result__btn--upper">
          같은 미리보기 다시 보기
        </Link>
        <Link to="/d-agent/mh-chat" className="mock-result__btn mock-result__btn--agent">
          My Agent에게 물어보기
        </Link>
        <Link to="/study/mock-exam" className="mock-result__link">
          모의고사 홈
        </Link>
      </div>
    </div>
  )
}
