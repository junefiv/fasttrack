import type { LectureEbookSection } from '../types/lectures'

const DEFAULT_MODEL = 'gemini-2.5-flash'

export type LectureChatTurn = { role: 'user' | 'model'; text: string }

function trimForLlm(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const head = Math.floor(maxChars * 0.55)
  const tail = maxChars - head - 80
  return `${text.slice(0, head)}\n\n[... 중간 생략 (토큰 한도) ...]\n\n${text.slice(-tail)}`
}

function formatCaptionsForPrompt(
  lines: { start: number; end: number; text: string }[],
): string {
  const body = lines
    .map((l) => `[${l.start}s–${l.end}s] ${l.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n')
  return trimForLlm(body, 100_000)
}

function formatEbookForPrompt(sections: LectureEbookSection[]): string {
  if (!sections.length) {
    return '(연결된 이북 본문이 아직 없습니다. 추후 강좌와 FK로 연결된 이북 텍스트가 여기에 포함됩니다.)'
  }
  const body = sections
    .map(
      (s) =>
        `## ${s.title}${s.pageStart != null ? ` (p.${s.pageStart}${s.pageEnd != null ? `–${s.pageEnd}` : ''})` : ''}\n${s.body}`,
    )
    .join('\n\n')
  return trimForLlm(body, 60_000)
}

function buildFullUserBlock(params: {
  contextAtSec: number
  lectureTitle: string
  sessionTitle: string
  instructor?: string
  subjectName?: string
  captionBlock: string
  ebookBlock: string
  userQuestion: string
}): string {
  const {
    contextAtSec,
    lectureTitle,
    sessionTitle,
    instructor,
    subjectName,
    captionBlock,
    ebookBlock,
    userQuestion,
  } = params
  return [
    `과목/주제: ${subjectName ?? '—'}`,
    `강좌: ${lectureTitle}`,
    `강사: ${instructor ?? '—'}`,
    `회차: ${sessionTitle}`,
    `질문 기준 재생 시점: ${contextAtSec.toFixed(1)}초`,
    '',
    '[[강의 자막]]',
    captionBlock,
    '',
    '[[연결 이북 본문 (추후 DB 연동)]]',
    ebookBlock,
    '',
    '[[사용자 질문]]',
    userQuestion.trim(),
  ].join('\n')
}

export type AskLectureTutorParams = {
  apiKey: string
  question: string
  /** 질문 기준 재생 시점(초) */
  pausedAtSec: number
  lectureTitle: string
  sessionTitle: string
  instructor?: string
  subjectName?: string
  captions: { start_sec: number; end_sec: number; text: string }[]
  ebookSections?: LectureEbookSection[]
}

export type AskLectureTutorChatParams = {
  apiKey: string
  contextAtSec: number
  lectureTitle: string
  sessionTitle: string
  instructor?: string
  subjectName?: string
  captions: { start_sec: number; end_sec: number; text: string }[]
  ebookSections?: LectureEbookSection[]
  /** 직전까지 완료된 턴 (user → model 반복, 마지막은 항상 model) */
  priorTurns: LectureChatTurn[]
  newUserMessage: string
}

function validatePriorTurns(turns: LectureChatTurn[]): void {
  for (let i = 0; i < turns.length; i++) {
    const expect: 'user' | 'model' = i % 2 === 0 ? 'user' : 'model'
    if (turns[i].role !== expect) {
      throw new Error('대화 기록 형식이 올바르지 않습니다.')
    }
  }
  if (turns.length > 0 && turns[turns.length - 1].role !== 'model') {
    throw new Error('대화 기록은 항상 모델 답변으로 끝나야 합니다.')
  }
}

export async function askLectureTutorChat(params: AskLectureTutorChatParams): Promise<string> {
  const {
    apiKey,
    contextAtSec,
    lectureTitle,
    sessionTitle,
    instructor,
    subjectName,
    captions,
    ebookSections = [],
    priorTurns,
    newUserMessage,
  } = params

  if (!apiKey) {
    throw new Error('Gemini API 키가 설정되지 않았습니다. VITE_GEMINI_API_KEY 를 확인하세요.')
  }

  if (priorTurns.length > 0) {
    validatePriorTurns(priorTurns)
  }

  const model = import.meta.env.VITE_GEMINI_MODEL?.trim() || DEFAULT_MODEL
  const captionBlock = formatCaptionsForPrompt(
    captions.map((c) => ({ start: c.start_sec, end: c.end_sec, text: c.text })),
  )
  const ebookBlock = formatEbookForPrompt(ebookSections)

  const systemBlock = [
    '당신은 수능/내신 대비 인강 튜터입니다.',
    '반드시 아래에 제공된 「강의 자막」과 「연결 이북 본문」 범위 안에서만 근거를 들어 답하세요.',
    '자료에 없는 내용은 추측하지 말고, 부족하다고 짧게 말하세요.',
    '한국어로 간결하게 설명하세요.',
    '같은 대화에서 이어지는 추가 질문에도, 첫 메시지에 주어진 자막·이북 범위를 벗어나지 마세요.',
  ].join('\n')

  const contents: { role: string; parts: { text: string }[] }[] = []

  if (priorTurns.length === 0) {
    contents.push({
      role: 'user',
      parts: [
        {
          text: buildFullUserBlock({
            contextAtSec,
            lectureTitle,
            sessionTitle,
            instructor,
            subjectName,
            captionBlock,
            ebookBlock,
            userQuestion: newUserMessage,
          }),
        },
      ],
    })
  } else {
    const firstUserText = priorTurns[0].text
    contents.push({
      role: 'user',
      parts: [
        {
          text: buildFullUserBlock({
            contextAtSec,
            lectureTitle,
            sessionTitle,
            instructor,
            subjectName,
            captionBlock,
            ebookBlock,
            userQuestion: firstUserText,
          }),
        },
      ],
    })
    for (let i = 1; i < priorTurns.length; i++) {
      const t = priorTurns[i]
      contents.push({
        role: t.role === 'model' ? 'model' : 'user',
        parts: [{ text: t.text }],
      })
    }
    contents.push({ role: 'user', parts: [{ text: newUserMessage.trim() }] })
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemBlock }] },
      contents,
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2048,
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

/** 단일 질문(첫 턴만) — {@link askLectureTutorChat} 래퍼 */
export async function askLectureTutor(params: AskLectureTutorParams): Promise<string> {
  const {
    apiKey,
    question,
    pausedAtSec,
    lectureTitle,
    sessionTitle,
    instructor,
    subjectName,
    captions,
    ebookSections = [],
  } = params
  return askLectureTutorChat({
    apiKey,
    contextAtSec: pausedAtSec,
    lectureTitle,
    sessionTitle,
    instructor,
    subjectName,
    captions,
    ebookSections,
    priorTurns: [],
    newUserMessage: question,
  })
}
