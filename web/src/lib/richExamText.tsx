import type { ReactNode } from 'react'

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
    parts.push(<u key={`exam-u-${k++}`}>{rest.slice(0, close.index)}</u>)
    rest = rest.slice(close.index + close.len)
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

export type RenderExamRichTextOptions = {
  /**
   * true면 `<p>`를 실제 `<p>` 대신 블록 span으로 나눔 (label 안 선택지 등 HTML 제약 대응).
   */
  softParagraphs?: boolean
}

/**
 * `<p>…</p>`는 문단으로 나누고, 각 문단 안의 `<u>…</u>`는 밑줄로 렌더합니다.
 * `<p>`가 없으면 밑줄 처리만 합니다.
 */
export function renderExamRichText(text: string, options?: RenderExamRichTextOptions): ReactNode {
  const soft = options?.softParagraphs === true

  if (!OPEN_P.test(text)) {
    return renderTextWithUnderline(text)
  }

  const segments = splitByParagraphTags(text)
  if (segments.length === 0) {
    return renderTextWithUnderline(text.replace(OPEN_P, '').replace(/<\/p>/gi, ''))
  }

  const nodes = segments.map((inner) => renderTextWithUnderline(inner))

  if (soft) {
    return (
      <>
        {nodes.map((node, i) => (
          <span key={`sp-${i}`} className="rich-exam-text__soft-para">
            {node}
          </span>
        ))}
      </>
    )
  }

  return (
    <>
      {nodes.map((node, i) => (
        <p key={`rp-${i}`} className="rich-exam-text__p">
          {node}
        </p>
      ))}
    </>
  )
}
