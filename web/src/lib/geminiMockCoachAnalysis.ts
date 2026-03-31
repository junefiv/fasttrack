import type { MockCatalogAccuracyBar } from './curriculumCoachStatus'
import type {
  MockAxisRollup,
  MockProblemCatalogGroup,
  MockStrengthWeakness,
} from './curriculumCoachMockInsights'

const DEFAULT_MODEL = 'gemini-2.5-flash'

const MAX_CATEGORY_ROWS = 40
const MAX_TAG_ROWS = 45
const MAX_WRONG_PER_EXAM = 12

export type MockCoachAnalysisPayload = {
  generatedAt: string
  /** 카드 상단 한 줄 요약과 동일 계열 */
  summaryLine: string
  /** 누적 제출 건수 기준 시험(시리즈)별 정답률 — 막대 차트와 동일 */
  cumulativeByExam: {
    subjectPillar: string
    examTitle: string
    correct: number
    total: number
    accuracyPercent: number
  }[]
  /** 문항별 최신 제출 1건 기준 유형·태그 집계 */
  latestByQuestion: {
    categoryRollups: { label: string; correct: number; total: number; accuracyPercent: number }[]
    tagRollups: { tag: string; correct: number; total: number; accuracyPercent: number }[]
    ruleBased: {
      categoryStrengths: { label: string; correct: number; total: number; accuracyPercent: number }[]
      categoryWeaknesses: { label: string; correct: number; total: number; accuracyPercent: number }[]
      tagStrengths: { tag: string; correct: number; total: number; accuracyPercent: number }[]
      tagWeaknesses: { tag: string; correct: number; total: number; accuracyPercent: number }[]
    }
    perExam: {
      examTitle: string
      subjectLabel: string
      correctCount: number
      wrongCount: number
      wrongItems: { questionNumber: number; category: string | null; tags: string[] }[]
    }[]
  } | null
  notesForModel: string[]
}

function trimRollups<T extends MockAxisRollup>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows
  return [...rows].sort((a, b) => b.total - a.total).slice(0, max)
}

/**
 * 모의고사 상세 패널에 표시되는 집계를 Gemini에 넘길 JSON으로 만듭니다.
 * 토큰 절약을 위해 긴 목록은 잘라냅니다.
 */
export function buildMockCoachAnalysisPayload(args: {
  summaryLine: string
  mockAccuracySections: { heading: string; bars: MockCatalogAccuracyBar[] }[]
  categoryRollups: MockAxisRollup[]
  tagRollups: MockAxisRollup[]
  categorySW: MockStrengthWeakness
  tagSW: MockStrengthWeakness
  problemGroups: MockProblemCatalogGroup[]
  subjectLabelById: Map<string, string>
}): MockCoachAnalysisPayload {
  const cumulativeByExam: MockCoachAnalysisPayload['cumulativeByExam'] = []
  for (const sec of args.mockAccuracySections) {
    for (const bar of sec.bars) {
      cumulativeByExam.push({
        subjectPillar: sec.heading,
        examTitle: bar.examLabel,
        correct: bar.correct,
        total: bar.total,
        accuracyPercent: bar.accuracyPercent,
      })
    }
  }

  const catTrim = trimRollups(args.categoryRollups, MAX_CATEGORY_ROWS)
  const tagTrim = trimRollups(args.tagRollups, MAX_TAG_ROWS)

  const hasLatest = args.problemGroups.some((g) => g.correct.length + g.wrong.length > 0)

  const latestByQuestion: MockCoachAnalysisPayload['latestByQuestion'] = hasLatest
    ? {
        categoryRollups: catTrim.map((r) => ({
          label: r.key,
          correct: r.correct,
          total: r.total,
          accuracyPercent: r.accuracyPercent,
        })),
        tagRollups: tagTrim.map((r) => ({
          tag: r.key,
          correct: r.correct,
          total: r.total,
          accuracyPercent: r.accuracyPercent,
        })),
        ruleBased: {
          categoryStrengths: args.categorySW.strengths.map((r) => ({
            label: r.key,
            correct: r.correct,
            total: r.total,
            accuracyPercent: r.accuracyPercent,
          })),
          categoryWeaknesses: args.categorySW.weaknesses.map((r) => ({
            label: r.key,
            correct: r.correct,
            total: r.total,
            accuracyPercent: r.accuracyPercent,
          })),
          tagStrengths: args.tagSW.strengths.map((r) => ({
            tag: r.key,
            correct: r.correct,
            total: r.total,
            accuracyPercent: r.accuracyPercent,
          })),
          tagWeaknesses: args.tagSW.weaknesses.map((r) => ({
            tag: r.key,
            correct: r.correct,
            total: r.total,
            accuracyPercent: r.accuracyPercent,
          })),
        },
        perExam: args.problemGroups.map((g) => ({
          examTitle: g.title,
          subjectLabel: args.subjectLabelById.get(g.subjectId) ?? g.subjectId,
          correctCount: g.correct.length,
          wrongCount: g.wrong.length,
          wrongItems: g.wrong.slice(0, MAX_WRONG_PER_EXAM).map((r) => ({
            questionNumber: r.questionNumber,
            category: r.categoryLabel,
            tags: r.tags,
          })),
        })),
      }
    : null

  return {
    generatedAt: new Date().toISOString(),
    summaryLine: args.summaryLine,
    cumulativeByExam,
    latestByQuestion,
    notesForModel: [
      'cumulativeByExam은 동일 문항을 여러 번 제출하면 건수만큼 반영된 누적 정답률이다.',
      'latestByQuestion이 있으면 문항당 최신 제출 1건만 반영한 유형·태그 통계다. 한 문항에 태그가 여러 개면 태그별 집계에 중복 반영될 수 있다.',
      'ruleBased는 앱에서 정답률 70% 이상·50% 미만·최소 2문항 같은 단순 규칙으로 뽑은 힌트이며, 최종 판단은 데이터를 함께 검토해 달라.',
      `유형·태그 표는 상위 ${MAX_CATEGORY_ROWS} / ${MAX_TAG_ROWS}개 축만 포함했을 수 있다.`,
    ],
  }
}

const SYSTEM_INSTRUCTION = [
  '역할: 대한민국 고등학교·수능 준비생을 돕는 학습 코치.',
  '입력: 카탈로그 모의고사 집계 JSON 하나. 통계만 근거로 서술하고, JSON에 없는 사실은 추측하지 않는다.',
  '반드시 구분해서 작성:',
  '【전체 요약】 2~4문장. 누적(시험별 막대)과 최신 제출 기준(유형·태그)의 차이가 있으면 한 문장으로 짚는다.',
  '【강점】 불릿 3~7개. 유형·태그·시험 중 일관되게 높은 영역을 우선. 표본이 매우 작으면(1문항) "참고만"이라고 적는다.',
  '【취약점·우선 보완】 불릿 3~8개. 낮은 정답률·ruleBased 보완 후보·틀린 문항이 몰린 시험/유형을 연결해 우선순위를 제안한다.',
  '【다음 학습 제안】 불릿 3~6개. 구체적이되 과장하지 말고, 복습 단원·유형·태그 단위로 행동 가능하게.',
  '톤: 한국어, 차분하고 교육적. 마크다운 기호(##, **)는 쓰지 말고 위 네 개의 【】 제목만 그대로 사용한다.',
].join('\n')

export async function analyzeMockCoachSnapshotWithGemini(params: {
  apiKey: string
  payload: MockCoachAnalysisPayload
}): Promise<string> {
  const { apiKey, payload } = params
  if (!apiKey.trim()) {
    throw new Error('Gemini API 키가 설정되지 않았습니다. VITE_GEMINI_API_KEY 를 확인하세요.')
  }

  const model = import.meta.env.VITE_GEMINI_MODEL?.trim() || DEFAULT_MODEL
  const userBlock = [
    '아래 JSON은 한 학습자의 카탈로그 모의고사 집계이다. 이 데이터만 근거로 네 블록(【전체 요약】【강점】【취약점·우선 보완】【다음 학습 제안】) 형식으로 답하라.',
    '',
    JSON.stringify(payload, null, 2),
  ].join('\n')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text: userBlock }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 3072,
      },
    }),
  })

  const data: unknown = await res.json().catch(() => ({}))

  if (!res.ok) {
    const msg =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as { error?: { message?: string } }).error?.message === 'string'
        ? (data as { error: { message: string } }).error.message
        : `Gemini 요청 실패 (${res.status})`
    throw new Error(msg)
  }

  const root = data as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = root.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? ''
  return text.trim() || '모델이 빈 응답을 반환했습니다.'
}
