import { Button, ScrollArea, Stack, Text, Textarea } from '@mantine/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LectureCaption, LectureEbookSection } from '../../types/lectures'
import { formatTimestamp } from '../../lib/formatTime'
import {
  retrieveCombinedEbookRagForLecturePdfs,
  retrieveCombinedEbookRagForQuestion,
} from '../../lib/ebookRag'
import { supabase } from '../../lib/supabase'
import {
  askLectureTutorChat,
  type LectureChatTurn,
  type QuestionContextKind,
} from '../../lib/gemini'
import './LectureQuestionModal.css'

export type { QuestionContextKind }

export type LectureQuestionThread = {
  id: string
  /** 이 탭을 연 시점(질문하기 클릭 시)의 재생 시각 */
  contextAtSec: number
  contextKind: QuestionContextKind
  /** contextKind === 'ebook' 일 때 PDF에서 선택한 원문(대화 전체에서 API에 유지) */
  ebookHighlight?: string
  /** 하이라이트가 있던 PDF 페이지(1-based) — 프롬프트 앵커 ±10페이지에 사용 */
  ebookHighlightPage?: number
  /** RAG 인덱싱·검색에 쓰는 동일 PDF URL */
  ebookPdfUrl?: string
  messages: LectureChatTurn[]
  /** 교재 등에서 드래그 인용 시 입력창에 미리 넣을 본문(첫 전송 전까지만 사용) */
  seedDraft?: string
}

/** 프롬프트 문구·앵커 설명용: 재생 시각 기준 앞뒤 10분 */
const CAPTION_WINDOW_RADIUS_SEC = 600

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
  /** 강좌에 연결된 PDF — 영상/자막 검색에서 질문할 때 이중 RAG에 사용 */
  lecturePdfRefs?: { pdf_url: string; title?: string | null }[]
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
  lecturePdfRefs = [],
}: Props) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const threadsRef = useRef(threads)
  threadsRef.current = threads

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null

  /** API에는 회차 전체 자막 전달; 질문 앵커(±10분)는 프롬프트에서만 설명 */
  const captionsForActiveThread = useMemo(() => captions, [captions])

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

    let ebookRagRetrieved: string | undefined
    try {
      const embModel =
        import.meta.env.VITE_GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001'
      if (activeThread.contextKind === 'ebook' && activeThread.ebookPdfUrl) {
        ebookRagRetrieved = await retrieveCombinedEbookRagForQuestion({
          client: supabase,
          pdfUrl: activeThread.ebookPdfUrl,
          apiKey,
          embeddingModel: embModel,
          highlight: activeThread.ebookHighlight ?? '',
          userMessage: q,
        })
      } else if (activeThread.contextKind === 'video' && lecturePdfRefs.length > 0) {
        ebookRagRetrieved = await retrieveCombinedEbookRagForLecturePdfs({
          client: supabase,
          refs: lecturePdfRefs.map((r) => ({ pdfUrl: r.pdf_url, title: r.title })),
          apiKey,
          embeddingModel: embModel,
          highlight: '',
          userMessage: q,
        })
      }
    } catch (err) {
      ebookRagRetrieved = `(RAG 인덱싱·검색 실패: ${err instanceof Error ? err.message : '알 수 없음'}. 자막·DB 본문만 참고하세요.)`
    }

    try {
      const text = await askLectureTutorChat({
        apiKey,
        contextKind: activeThread.contextKind,
        contextAtSec: activeThread.contextAtSec,
        lectureTitle,
        sessionTitle,
        instructor,
        subjectName,
        captions: captionsForActiveThread,
        ebookSections,
        ebookHighlight: activeThread.ebookHighlight,
        ebookHighlightPage: activeThread.ebookHighlightPage,
        ebookRagRetrieved,
        captionWindowRadiusSec: CAPTION_WINDOW_RADIUS_SEC,
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
                <span className="qchat-main__dot"> · </span>
                {activeThread.contextKind === 'ebook' ? (
                  <Text span fw={600} c="dimmed">
                    교재 하이라이트 · 페이지 기준 ±10p 앵커
                  </Text>
                ) : (
                  <Text span fw={600} c="dimmed">
                    재생·검색 시각 기준 ±10분 앵커
                  </Text>
                )}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {activeThread.contextKind === 'ebook'
                  ? '회차 전체 자막·교재 전체 본문을 바탕으로 답하며, 질문 앵커는 하이라이트 페이지 ±10페이지로 안내합니다.'
                  : '회차 전체 자막·교재 전체 본문을 바탕으로 답하며, 질문 앵커는 재생(또는 자막 검색) 시각 ±10분으로 안내합니다.'}{' '}
                같은 탭에서 이어서 질문할 수 있습니다.
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
