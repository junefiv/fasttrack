import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  askLearningCoachChat,
  type LearningCoachChatTurn,
} from '../../lib/gemini'
import './LearningCoachChatPage.css'

const STORAGE_KEY = 'fasttrack-dagent-learning-coach-v1'

type CoachSession = {
  id: string
  updatedAt: number
  messages: LearningCoachChatTurn[]
}

function loadSessions(): CoachSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (s): s is CoachSession =>
          typeof s === 'object' &&
          s !== null &&
          typeof (s as CoachSession).id === 'string' &&
          typeof (s as CoachSession).updatedAt === 'number' &&
          Array.isArray((s as CoachSession).messages),
      )
      .map((s) => ({
        id: s.id,
        updatedAt: s.updatedAt,
        messages: s.messages.filter(
          (m): m is LearningCoachChatTurn =>
            m &&
            typeof m === 'object' &&
            (m.role === 'user' || m.role === 'model') &&
            typeof m.text === 'string',
        ),
      }))
  } catch {
    return []
  }
}

function saveSessions(sessions: CoachSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    /* ignore quota */
  }
}

function previewFromMessages(messages: LearningCoachChatTurn[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (!first?.text) return '새 대화'
  const t = first.text.replace(/\s+/g, ' ').trim()
  return t.length > 40 ? `${t.slice(0, 40)}…` : t
}

type PreparedSend = {
  nextSessions: CoachSession[]
  priorForApi: LearningCoachChatTurn[]
  resolvedSid: string
}

/** API에 넣을 이전 턴(새 사용자 메시지 제외)과, 사용자 메시지를 반영한 다음 세션 목록을 동기적으로 만듭니다. */
function prepareSend(
  prev: CoachSession[],
  activeId: string | null,
  text: string,
): PreparedSend | null {
  const sid =
    activeId && prev.some((s) => s.id === activeId) ? activeId : crypto.randomUUID()
  let list = prev
  if (!prev.some((s) => s.id === sid)) {
    list = [{ id: sid, updatedAt: Date.now(), messages: [] }, ...prev]
  }
  const s = list.find((x) => x.id === sid)
  if (!s) return null
  const priorForApi = [...s.messages]
  const nextSessions = list.map((x) =>
    x.id === sid
      ? {
          ...x,
          updatedAt: Date.now(),
          messages: [...x.messages, { role: 'user' as const, text }],
        }
      : x,
  )
  return { nextSessions, priorForApi, resolvedSid: sid }
}

export function LearningCoachChatPage() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? ''

  const [sessions, setSessions] = useState<CoachSession[]>(() => loadSessions())
  const [activeId, setActiveId] = useState<string | null>(() => {
    const list = loadSessions()
    return list[0]?.id ?? null
  })
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  )

  const scrollBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollBottom()
  }, [active?.messages.length, scrollBottom])

  const newChat = useCallback(() => {
    const id = crypto.randomUUID()
    const next: CoachSession = { id, updatedAt: Date.now(), messages: [] }
    setSessions((prev) => [next, ...prev])
    setActiveId(id)
    setDraft('')
    setError(null)
  }, [])

  const selectSession = useCallback((id: string) => {
    setActiveId(id)
    setError(null)
  }, [])

  const deleteSession = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id)
        if (activeId === id) {
          setActiveId(next[0]?.id ?? null)
        }
        return next
      })
    },
    [activeId],
  )

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || loading) return
    if (!apiKey) {
      setError('VITE_GEMINI_API_KEY 가 .env 에 설정되어 있는지 확인하세요.')
      return
    }

    const prepared = prepareSend(sessionsRef.current, activeId, text)
    if (!prepared) return

    const { nextSessions, priorForApi, resolvedSid } = prepared
    setSessions(nextSessions)

    if (activeId !== resolvedSid) {
      setActiveId(resolvedSid)
    }

    setDraft('')
    setError(null)
    setLoading(true)

    try {
      const reply = await askLearningCoachChat({
        apiKey,
        priorTurns: priorForApi,
        newUserMessage: text,
      })
      setSessions((prev) =>
        prev.map((s) =>
          s.id === resolvedSid
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...s.messages, { role: 'model', text: reply }],
              }
            : s,
        ),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : '요청에 실패했습니다.'
      setError(msg)
      setSessions((prev) =>
        prev.map((s) =>
          s.id === resolvedSid
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: s.messages.filter((m) => !(m.role === 'user' && m.text === text)),
              }
            : s,
        ),
      )
    } finally {
      setLoading(false)
    }
  }, [apiKey, activeId, draft, loading])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  )

  return (
    <div>
      {!apiKey ? (
        <p className="learning-coach__key-hint" role="alert">
          Gem1ini API 키가 없습니다. 웹 앱 루트의 <code>.env</code>에{' '}
          <code>VITE_GEMINI_API_KEY</code>를 넣고 개발 서버를 다시 시작하세요.
        </p>
      ) : null}

      <div className="learning-coach">
        <aside className="learning-coach__archive" aria-label="질문 아카이브">
          <div className="learning-coach__archive-head">
            <p className="learning-coach__archive-label">질문 아카이브</p>
            <button type="button" className="learning-coach__new-btn" onClick={newChat}>
              새 대화
            </button>
          </div>
          <div className="learning-coach__archive-list">
            {sortedSessions.length === 0 ? (
              <p className="learning-coach__empty" style={{ margin: '0.5rem', fontSize: '0.8rem' }}>
                대화가 없습니다. 새 대화를 눌러 시작하세요.
              </p>
            ) : (
              sortedSessions.map((s) => (
                <div key={s.id} className="learning-coach__archive-row">
                  <button
                    type="button"
                    className={`learning-coach__archive-item${
                      s.id === activeId ? ' learning-coach__archive-item--active' : ''
                    }`}
                    onClick={() => selectSession(s.id)}
                  >
                    <span className="learning-coach__archive-item-text">
                      {previewFromMessages(s.messages)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="learning-coach__archive-del"
                    aria-label="대화 삭제"
                    onClick={(e) => deleteSession(s.id, e)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="learning-coach__main" aria-label="학습코치 채팅">
          <header className="learning-coach__header">
            <h1 className="learning-coach__title">학습코치</h1>
            <p className="learning-coach__scope">
              학습·교과·교재·강좌·입시·배경지식·시사에 관한 질문만 답합니다. 그 외 주제는 안내하지
              않습니다.
            </p>
          </header>

          <div className="learning-coach__messages" role="log" aria-live="polite">
            {!active || active.messages.length === 0 ? (
              <p className="learning-coach__empty">
                아래 입력창에 질문을 입력하세요. Enter로 전송, Shift+Enter로 줄바꿈입니다.
              </p>
            ) : (
              active.messages.map((m, i) => (
                <div
                  key={`${active.id}-${i}-${m.role}`}
                  className={`learning-coach__bubble learning-coach__bubble--${m.role}`}
                >
                  {m.text}
                </div>
              ))
            )}
            {loading ? (
              <div className="learning-coach__bubble learning-coach__bubble--model" aria-busy>
                답변을 작성하는 중…
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <footer className="learning-coach__composer">
            {error ? (
              <p className="learning-coach__error" role="alert">
                {error}
              </p>
            ) : null}
            <textarea
              className="learning-coach__textarea"
              placeholder="학습·교과·교재·강좌·입시·배경지식·시사 관련 질문을 입력하세요."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading || !apiKey}
              rows={3}
            />
            <div className="learning-coach__row">
              <button
                type="button"
                className="learning-coach__send"
                onClick={() => void send()}
                disabled={loading || !draft.trim() || !apiKey}
              >
                {loading ? '전송 중…' : '보내기'}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}
