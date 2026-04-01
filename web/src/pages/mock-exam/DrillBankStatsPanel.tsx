import { Button, Modal, Paper, RingProgress, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchQuestionsBankStatsBySubjectForUser,
  type QuestionsBankSubjectStat,
} from '../../lib/fasttrackQueries'
import type { SubjectRow } from '../../types/fasttrack'

type Props = {
  userId: string
  subjects: SubjectRow[]
  selectedSubjectId: string | null
}

function subjectDonutSections(correct: number, total: number) {
  if (total <= 0) {
    return [{ value: 100, color: 'dark.5' as const }]
  }
  const pct = Math.round((correct / total) * 100)
  const rest = 100 - pct
  return [
    { value: pct, color: 'cyan' as const },
    { value: rest, color: 'dark.5' as const },
  ]
}

export function DrillBankStatsPanel({ userId, subjects, selectedSubjectId }: Props) {
  const [stats, setStats] = useState<QuestionsBankSubjectStat[]>([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [aiHint, setAiHint] = useState<string | null>(null)
  const [detailOpened, { open: openDetail, close: closeDetail }] = useDisclosure(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      const list = await fetchQuestionsBankStatsBySubjectForUser(userId)
      setStats(list)
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : '통계를 불러오지 못했습니다.')
      setStats([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const statsBySubject = useMemo(() => new Map(stats.map((s) => [s.subjectId, s])), [stats])

  const selectedSubjectName = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId)?.name ?? null,
    [subjects, selectedSubjectId],
  )

  const selectedStat = selectedSubjectId ? statsBySubject.get(selectedSubjectId) : undefined

  return (
    <section className="drill-bank-stats" aria-label="문제은행 과목별 정답률">
      <div className="drill-bank-stats__head">
        <Title order={4} className="drill-bank-stats__title" c="dimmed" size="h5">
          내 문제은행 정답률
        </Title>
        <Text size="xs" c="dimmed">
          과목별 누적 풀이 기준 · 정답(시간·내용 모두 통과)만 집계
        </Text>
      </div>

      {loadErr ? (
        <Text size="sm" c="red.4">
          {loadErr}
        </Text>
      ) : null}

      {loading ? (
        <Text size="sm" c="dimmed">
          통계 불러오는 중…
        </Text>
      ) : (
        <div className="drill-bank-stats__donuts">
          {subjects.map((subj) => {
            const s = statsBySubject.get(subj.id) ?? { correct: 0, total: 0 }
            const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : null
            const active = selectedSubjectId === subj.id
            return (
              <Paper
                key={subj.id}
                withBorder
                radius="md"
                p="sm"
                className={`drill-bank-stats__cell${active ? ' drill-bank-stats__cell--active' : ''}`}
              >
                <Stack align="center" gap={6}>
                  <Text size="xs" fw={600} ta="center" lineClamp={2}>
                    {subj.name}
                  </Text>
                  <RingProgress
                    size={92}
                    thickness={10}
                    roundCaps
                    sections={subjectDonutSections(s.correct, s.total)}
                    label={
                      <Text size="xs" fw={700} ta="center" c={s.total > 0 ? 'cyan.3' : 'dimmed'}>
                        {pct != null ? `${pct}%` : '—'}
                      </Text>
                    }
                  />
                  <Text size="xs" c="dimmed" ta="center">
                    {s.total > 0 ? `${s.correct} / ${s.total}` : '풀이 없음'}
                  </Text>
                </Stack>
              </Paper>
            )
          })}
        </div>
      )}

      <div className="drill-bank-stats__actions">
        <Button
          variant="light"
          color="cyan"
          size="sm"
          radius="md"
          disabled={!selectedSubjectId}
          onClick={openDetail}
        >
          자세히 보기
        </Button>
      </div>

      <Modal
        opened={detailOpened}
        onClose={() => {
          setAiHint(null)
          closeDetail()
        }}
        title="문제은행 학습 분석"
        size="md"
        radius="md"
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      >
        <Stack gap="md">
          {!selectedSubjectId || !selectedSubjectName ? (
            <Text size="sm" c="dimmed">
              과목을 먼저 선택해 주세요.
            </Text>
          ) : (
            <>
              <div>
                <Text size="sm" c="dimmed" mb={4}>
                  선택한 과목
                </Text>
                <Text fw={700}>{selectedSubjectName}</Text>
                {selectedStat && selectedStat.total > 0 ? (
                  <Text size="sm" c="dimmed" mt={6}>
                    누적 정답 {selectedStat.correct} / {selectedStat.total} (
                    {Math.round((selectedStat.correct / selectedStat.total) * 100)}%)
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed" mt={6}>
                    이 과목의 문제은행 풀이 기록이 아직 없습니다.
                  </Text>
                )}
              </div>

              <Text size="sm" c="dimmed">
                AI가 제출·유형·태그·시간 데이터를 바탕으로 취약점과 강점을 요약합니다. (연동 예정)
              </Text>

              <Button
                color="teal"
                variant="gradient"
                gradient={{ from: 'teal', to: 'cyan', deg: 105 }}
                onClick={() =>
                  setAiHint('AI 분석은 곧 연결됩니다. 지금은 문제은행 드릴을 계속 풀어 주세요.')
                }
              >
                AI로 취약점·강점 분석하기
              </Button>

              {aiHint ? (
                <Text size="sm" c="cyan.3">
                  {aiHint}
                </Text>
              ) : null}
            </>
          )}
        </Stack>
      </Modal>
    </section>
  )
}
