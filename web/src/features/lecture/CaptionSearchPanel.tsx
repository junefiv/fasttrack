import { Button } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import type { LectureCaption } from '../../types/lectures'
import { formatTimestamp } from '../../lib/formatTime'
import './CaptionSearchPanel.css'

type Props = {
  captions: LectureCaption[]
  onSeek: (startSec: number) => void
  activeStartSec?: number | null
  /** Drawer 등에 넣을 때 리스트 높이 조절 */
  variant?: 'default' | 'drawer'
  /** Enter 순회·행 클릭으로 강조된 줄에서만 노출되는 질문하기 클릭 시 해당 시각 기준으로 `LectureQuestionPanel`을 열 때 */
  onOpenQuestionAtSec?: (startSec: number) => void
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function CaptionSearchPanel({
  captions,
  onSeek,
  activeStartSec,
  variant = 'default',
  onOpenQuestionAtSec,
}: Props) {
  const [q, setQ] = useState('')
  /** Enter로 순회할 때 현재 줄(필터 목록 기준). 검색어가 바뀌면 맨 위부터 다시. */
  const [stepIndex, setStepIndex] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return captions
    return captions.filter((c) => c.text.toLowerCase().includes(t))
  }, [captions, q])

  const queryTrim = q.trim()

  useEffect(() => {
    setStepIndex(null)
  }, [queryTrim])

  useEffect(() => {
    if (stepIndex === null || filtered.length === 0) return
    const c = filtered[stepIndex]
    if (!c) return
    const el = document.getElementById(`cap-panel-row-${c.id}`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [stepIndex, filtered])

  const moveStepDown = () => {
    if (filtered.length === 0) return
    setStepIndex((prev) => {
      const next = prev === null ? 0 : prev + 1 >= filtered.length ? 0 : prev + 1
      onSeek(filtered[next].start_sec)
      return next
    })
  }

  return (
    <section
      className={`cap-panel${variant === 'drawer' ? ' cap-panel--drawer' : ''}`}
      aria-label="자막 검색"
    >
      <div className="cap-panel__head">
        <h2 className="cap-panel__title">자막 검색</h2>
        <p className="cap-panel__hint">
          본문을 입력해 구간을 찾고, 항목을 누르면 해당 시점으로 이동합니다. Enter로 순회해 강조된 줄(또는 클릭해 선택한 줄) 안쪽 오른쪽에서만 해당 구간 기준 질문하기를 열 수 있습니다.
        </p>
      </div>
      <input
        className="cap-panel__input"
        type="search"
        placeholder="예: 미분, 수열의 극한…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          moveStepDown()
        }}
        autoComplete="off"
      />
      <ul className="cap-panel__list">
        {filtered.length === 0 ? (
          <li className="cap-panel__empty">일치하는 자막이 없습니다.</li>
        ) : (
          filtered.map((c, i) => {
            const active = activeStartSec != null && c.start_sec === activeStartSec
            const stepped = stepIndex === i
            return (
              <li key={c.id}>
                <div
                  className={`cap-panel__row${active ? ' cap-panel__row--active' : ''}${stepped ? ' cap-panel__row--step' : ''}`}
                >
                  <button
                    type="button"
                    id={`cap-panel-row-${c.id}`}
                    className="cap-panel__row-main"
                    onClick={() => {
                      setStepIndex(i)
                      onSeek(c.start_sec)
                    }}
                  >
                    <span className="cap-panel__time">
                      {formatTimestamp(c.start_sec)} – {formatTimestamp(c.end_sec)}
                    </span>
                    <span className="cap-panel__text">
                      <CaptionSnippet text={c.text} query={queryTrim} />
                    </span>
                  </button>
                  {stepped && onOpenQuestionAtSec ? (
                    <Button
                      type="button"
                      variant="light"
                      color="teal"
                      size="compact-xs"
                      className="cap-panel__ask"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onOpenQuestionAtSec(c.start_sec)
                      }}
                    >
                      질문하기
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })
        )}
      </ul>
    </section>
  )
}

function CaptionSnippet({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const re = new RegExp(`(${escapeRegExp(query)})`, 'ig')
  const parts = text.split(re)
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="cap-panel__mark">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}
