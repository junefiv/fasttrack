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
  /** Enter 순회 시 `matches` 배열 안의 인덱스. 검색어 변경 시 초기화. */
  const [stepMatchIndex, setStepMatchIndex] = useState<number | null>(null)

  const queryTrim = q.trim()
  const queryNorm = queryTrim.toLowerCase()

  const matches = useMemo(() => {
    if (!queryNorm) return []
    return captions.filter((c) => c.text.toLowerCase().includes(queryNorm))
  }, [captions, queryNorm])

  useEffect(() => {
    setStepMatchIndex(null)
  }, [queryNorm])

  useEffect(() => {
    if (stepMatchIndex === null || matches.length === 0) return
    const c = matches[stepMatchIndex]
    if (!c) return
    const el = document.getElementById(`cap-panel-row-${c.id}`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [stepMatchIndex, matches])

  const moveStepDown = () => {
    if (matches.length === 0) return
    setStepMatchIndex((prev) => {
      const next = prev === null ? 0 : prev + 1 >= matches.length ? 0 : prev + 1
      onSeek(matches[next].start_sec)
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
          전체 자막이 목록에 표시되며, 검색어와 일치하는 글자는 강조됩니다. Enter는 일치하는 줄만 순환하며 선택 표시를 옮기고 해당 시점으로 이동합니다. 선택된 줄에서만 질문하기를 열 수 있습니다.
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
        {captions.length === 0 ? (
          <li className="cap-panel__empty">자막이 없습니다.</li>
        ) : (
          captions.map((c) => {
            const active = activeStartSec != null && c.start_sec === activeStartSec
            const stepCap =
              stepMatchIndex !== null && matches[stepMatchIndex] ? matches[stepMatchIndex] : null
            const stepped = stepCap != null && stepCap.id === c.id
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
                      const mi = matches.findIndex((m) => m.id === c.id)
                      setStepMatchIndex(mi >= 0 ? mi : null)
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
