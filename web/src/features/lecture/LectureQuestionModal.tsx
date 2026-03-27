import { Button, ScrollArea, Stack, Text, Textarea } from '@mantine/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LectureCaption, LectureEbookSection } from '../../types/lectures'
import { formatTimestamp } from '../../lib/formatTime'
import { askLectureTutorChat, type LectureChatTurn } from '../../lib/gemini'
import './LectureQuestionModal.css'

export type LectureQuestionThread = {
  id: string
  /** 이 탭을 연 시점(질문하기 클릭 시)의 재생 시각 */
  contextAtSec: number
  messages: LectureChatTurn[]
  /** 교재 등에서 드래그 인용 시 입력창에 미리 넣을 본문(첫 전송 전까지만 사용) */
  seedDraft?: string
}

type Props = {
  opened: boolean
  onClose: () => void
  threads: LectureQuestionThread[]
  setThreads: React.Dispatch<React.SetStateAction<LectureQuestionThread[]>>
  activeThreadId: string | null
  setActiveThreadId: (id: string | null) => void
  lectureTitle: string
  sessionTitle: string
  instructor?: string
  subjectName?: string
  captions: LectureCaption[]
  ebookSections?: LectureEbookSection[]
}

function threadTabPreview(messages: LectureChatTurn[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (!first?.text) return '새 대화'
  const t = first.text.replace(/\s+/g, ' ').trim()
  return t.length > 36 ? `${t.slice(0, 36)}…` : t
}

export function LectureQuestionPanel({
  opened,
  onClose,
  threads,
  setThreads,
  activeThreadId,
  setActiveThreadId,
  lectureTitle,
  sessionTitle,
  instructor,
  subjectName,
  captions,
  ebookSections = [],
}: Props) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const threadsRef = useRef(threads)
  threadsRef.current = threads

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!opened) return
    scrollToBottom()
  }, [opened, activeThread?.messages.length, scrollToBottom])

  useEffect(() => {
    if (!opened || !activeThreadId) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(t)
  }, [opened, activeThreadId])

  useEffect(() => {
    setError(null)
    const t = threadsRef.current.find((x) => x.id === activeThreadId)
    if (!t) {
      setDraft('')
      return
    }
    if (t.messages.length > 0) return
    const seed = t.seedDraft?.trim()
    setDraft(seed ? `[교재 인용]\n${seed}\n\n` : '')
  }, [activeThreadId])

  if (!opened) return null

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY ?? ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = draft.trim()
    if (!q || loading || !activeThread) return

    const threadId = activeThread.id
    const prior = activeThread.messages

    setDraft('')
    setError(null)
    setLoading(true)

    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId ? { ...t, messages: [...t.messages, { role: 'user', text: q }] } : t,
      ),
    )

    try {
      const text = await askLectureTutorChat({
        apiKey,
        contextAtSec: activeThread.contextAtSec,
        lectureTitle,
        sessionTitle,
        instructor,
        subjectName,
        captions,
        ebookSections,
        priorTurns: prior,
        newUserMessage: q,
      })
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, messages: [...t.messages, { role: 'model', text }] } : t,
        ),
      )
    } catch (err) {
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t
          const m = [...t.messages]
          const last = m[m.length - 1]
          if (last?.role === 'user' && last.text === q) m.pop()
          return { ...t, messages: m }
        }),
      )
      setDraft(q)
      setError(err instanceof Error ? err.message : '요청에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const orderedTabs = [...threads].reverse()

  return (
    <div className="qchat-root" style={{ flex: 1, minHeight: 0 }}>
      <nav className="qchat-tabs" aria-label="대화 탭">
        <div className="qchat-tabs__label">대화</div>
        <ScrollArea className="qchat-tabs__scroll" type="auto" offsetScrollbars>
          <Stack gap={6} pr={6}>
            {orderedTabs.map((t) => {
              const active = t.id === activeThreadId
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`qchat-tab${active ? ' qchat-tab--active' : ''}`}
                  onClick={() => setActiveThreadId(t.id)}
                >
                  <span className="qchat-tab__time">{formatTimestamp(t.contextAtSec)}</span>
                  <span className="qchat-tab__preview">{threadTabPreview(t.messages)}</span>
                </button>
              )
            })}
          </Stack>
        </ScrollArea>
      </nav>

      <div className="qchat-main">
        {activeThread ? (
          <>
            <div className="qchat-main__meta">
              <Text size="xs" c="dimmed">
                이 탭 기준 시각{' '}
                <Text span fw={600} c="teal" ff="monospace">
                  {formatTimestamp(activeThread.contextAtSec)}
                </Text>
                <span className="qchat-main__dot"> · </span>
                {sessionTitle}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                자막·이북 범위 안에서만 답합니다. 같은 탭에서 이어서 질문할 수 있습니다.
              </Text>
            </div>

            <ScrollArea
              className="qchat-messages"
              type="auto"
              offsetScrollbars
              style={{ flex: 1, minHeight: 0 }}
            >
              <Stack gap="sm" pr={4} pb="md">
                {activeThread.messages.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    이 구간 기준으로 첫 질문을 입력해 주세요.
                  </Text>
                ) : null}
                {activeThread.messages.map((m, i) =>
                  m.role === 'user' ? (
                    <div key={`${i}-u`} className="qchat-bubble qchat-bubble--user">
                      <Text size="xs" c="dimmed" mb={4}>
                        나
                      </Text>
                      <Text size="sm" className="qchat-bubble__body">
                        {m.text}
                      </Text>
                    </div>
                  ) : (
                    <div key={`${i}-m`} className="qchat-bubble qchat-bubble--model">
                      <Text size="xs" c="dimmed" mb={4}>
                        Gemini
                      </Text>
                      <Text size="sm" className="qchat-bubble__body" style={{ whiteSpace: 'pre-wrap' }}>
                        {m.text}
                      </Text>
                    </div>
                  ),
                )}
                <div ref={messagesEndRef} />
              </Stack>
            </ScrollArea>

            <form className="qchat-form" onSubmit={handleSubmit}>
              <Textarea
                ref={inputRef}
                placeholder={
                  activeThread.messages.length > 0
                    ? '이어서 질문 입력…'
                    : '이 구간 기준 첫 질문을 입력…'
                }
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={loading}
                minRows={2}
                maxRows={6}
                autosize
              />
              {error ? (
                <Text size="sm" c="red" mt={6}>
                  {error}
                </Text>
              ) : null}
              <div className="qchat-form__actions">
                <Button type="button" variant="default" size="compact-sm" onClick={onClose}>
                  닫기
                </Button>
                <Button
                  type="submit"
                  color="teal"
                  size="compact-sm"
                  loading={loading}
                  disabled={!draft.trim()}
                >
                  질문하기
                </Button>
              </div>
            </form>
          </>
        ) : (
          <Text size="sm" c="dimmed" p="md">
            왼쪽에서 대화를 선택하거나, 영상에서 「질문하기」로 새 탭을 여세요.
          </Text>
        )}
      </div>
    </div>
  )
}
