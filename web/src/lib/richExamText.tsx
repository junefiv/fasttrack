import type { ReactNode } from 'react'
import './richExamText.css'

const OPEN_U = /<u\s*>/i
const OPEN_P = /<p\b[^>]*>/i

function findClosingU(s: string): { index: number; len: number } | null {
  const i = s.toLowerCase().indexOf('</u>')
  if (i === -1) return null
  return { index: i, len: 4 }
}

/** `<p>...</p>` 바깥·안쪽 텍스트를 순서대로 뽑아 문단 문자열 배열로 만듭니다. */
function splitByParagraphTags(text: string): string[] {
  const out: string[] = []
  let rest = text

  while (rest.length > 0) {
    const m = rest.match(OPEN_P)
    if (!m || m.index === undefined) {
      const tail = rest.trim()
      if (tail) out.push(tail)
      break
    }
    if (m.index > 0) {
      const lead = rest.slice(0, m.index).trim()
      if (lead) out.push(lead)
    }
    rest = rest.slice(m.index + m[0].length)
    const ci = rest.toLowerCase().indexOf('</p>')
    if (ci === -1) {
      const chunk = rest.trim()
      if (chunk) out.push(chunk)
      break
    }
    const inner = rest.slice(0, ci).trim()
    if (inner) out.push(inner)
    rest = rest.slice(ci + 4)
  }

  return out
}

/** DB 문자열의 `<u>…</u>` 구간만 실제 밑줄(`<u>`)로 렌더합니다. */
export function renderTextWithUnderline(text: string): ReactNode {
  if (!OPEN_U.test(text)) return text

  const parts: ReactNode[] = []
  let rest = text
  let k = 0

  while (rest.length > 0) {
    const m = rest.match(OPEN_U)
    if (!m || m.index === undefined) {
      parts.push(rest)
      break
    }
    if (m.index > 0) parts.push(rest.slice(0, m.index))
    rest = rest.slice(m.index + m[0].length)
    const close = findClosingU(rest)
    if (!close) {
      parts.push(rest)
      break
    }
    parts.push(
      <u key={`exam-u-${k++}`} className="rich-exam-text__u">
        {rest.slice(0, close.index)}
      </u>,
    )
    rest = rest.slice(close.index + close.len)
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

export type RenderExamRichTextOptions = {
  /**
   * true면 `<p>`를 실제 `<p>` 대신 블록 span으로 나눔 (label 안 선택지 등 HTML 제약 대응).
   */
  softParagraphs?: boolean
  /**
   * false면 바깥 `.rich-exam-text` 래퍼 생략(선택지 등). 기본 true — 문단은 `<p>`만, `\n`은 문단 아님.
   */
  wrap?: boolean
}

/**
 * `<p>…</p>`만 문단으로 나눕니다. 각 문단 안의 `<u>…</u>`는 인라인 밑줄만 적용합니다.
 * `<p>`가 없으면 한 덩어리로 밑줄만 처리합니다(줄바꿈 문자로 문단 나누지 않음).
 */
export function renderExamRichText(text: string, options?: RenderExamRichTextOptions): ReactNode {
  const soft = options?.softParagraphs === true
  const wrap = options?.wrap !== false

  let inner: ReactNode

  if (!OPEN_P.test(text)) {
    inner = renderTextWithUnderline(text)
  } else {
    const segments = splitByParagraphTags(text)
    if (segments.length === 0) {
      inner = renderTextWithUnderline(text.replace(OPEN_P, '').replace(/<\/p>/gi, ''))
    } else {
      const nodes = segments.map((seg) => renderTextWithUnderline(seg))
      if (soft) {
        inner = (
          <>
            {nodes.map((node, i) => (
              <span key={`sp-${i}`} className="rich-exam-text__soft-para">
                {node}
              </span>
            ))}
          </>
        )
      } else {
        inner = (
          <>
            {nodes.map((node, i) => (
              <p key={`rp-${i}`} className="rich-exam-text__p">
                {node}
              </p>
            ))}
          </>
        )
      }
    }
  }

  if (!wrap) return inner
  return <div className="rich-exam-text">{inner}</div>
}
