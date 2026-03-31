import { renderExamRichText } from '../lib/richExamText'
import './ReadingBodyDiagrams.css'

function safeResourceUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (t.startsWith('/')) return t
  try {
    const u = new URL(t)
    if (u.protocol === 'https:' || u.protocol === 'http:') return t
    return null
  } catch {
    return null
  }
}

function isSvgMarkup(s: string): boolean {
  return /^\s*<\?xml/i.test(s) || /^\s*<svg\b/i.test(s)
}

type Props = {
  diagram?: string | null
  diagramUrl?: string | null
  className?: string
}

/** 본문 영역: `diagram_url`(이미지) · `diagram`(SVG 마크업 또는 설명 텍스트) */
export function ReadingBodyDiagrams({ diagram, diagramUrl, className }: Props) {
  const url = diagramUrl?.trim() ? safeResourceUrl(diagramUrl) : null
  const d = diagram?.trim() ? diagram.trim() : ''
  const svg = d ? isSvgMarkup(d) : false

  if (!url && !d) return null

  return (
    <div className={className ?? 'reading-body-diagrams'}>
      {url ? (
        <figure className="reading-body-diagrams__fig">
          <img
            src={url}
            alt="도식"
            className="reading-body-diagrams__img"
            loading="lazy"
            decoding="async"
          />
        </figure>
      ) : null}
      {d ? (
        svg ? (
          <div
            className="reading-body-diagrams__svg"
            // DB에서 관리하는 도형 마크업
            dangerouslySetInnerHTML={{ __html: d }}
          />
        ) : (
          <div className="reading-body-diagrams__text">{renderExamRichText(d)}</div>
        )
      ) : null}
    </div>
  )
}
