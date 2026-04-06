import type { ReactNode } from 'react'
import type { ChoiceOption } from '../types/fasttrack'
import { renderExamRichText } from '../lib/richExamText'
import { ReadingBodyDiagrams } from './ReadingBodyDiagrams'
import './ProblemRenderer.css'

function parseChoices(raw: unknown): ChoiceOption[] {
  if (raw == null) return []

  let v: unknown = raw
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return []
    try {
      v = JSON.parse(t) as unknown
    } catch {
      return []
    }
  }

  if (!Array.isArray(v)) return []

  return v
    .map((item, i): ChoiceOption | null => {
      if (typeof item === 'string') {
        return { id: String(i + 1), text: item }
      }
      if (item && typeof item === 'object' && 'id' in item && 'text' in item) {
        const o = item as { id: unknown; text: unknown }
        return { id: String(o.id), text: String(o.text) }
      }
      return null
    })
    .filter((x): x is ChoiceOption => x !== null)
}

type Props = {
  questionText: string
  instructionText?: string | null
  problemNumber?: number | null
  questionCategory?: string | null
  keywords?: string[] | null
  recommendedTimeSec?: number | null
  difficultyLabel?: string | null
  /** 카탈로그 등: 공유 읽기 자료(본문). 있으면 발문/지문 라벨을 구분해 씀 */
  readingBody?: string | null
  /** true면 본문 블록을 여기서 렌더하지 않음(부모가 옆 패널·Drawer 등에 표시) */
  suppressReadingBody?: boolean
  /** 본문 영역 도식(텍스트/SVG) */
  readingDiagram?: string | null
  /** 본문 영역 도식 이미지 URL */
  readingDiagramUrl?: string | null
  passage?: string | null
  referenceView?: string | null
  choices: unknown
  name: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  showCorrect?: boolean
  correctAnswer?: string
  /** 객관식 선택지가 없을 때(단답·서술 등) 부모가 직접 답 입력 UI를 넣을 때 사용 */
  noChoicesContent?: ReactNode
}

function formatDifficulty(d: string | null | undefined): string | null {
  if (!d) return null
  if (d === 'easy') return '쉬움'
  if (d === 'medium') return '보통'
  if (d === 'hard') return '어려움'
  return d
}

export function ProblemRenderer({
  questionText,
  instructionText,
  problemNumber,
  questionCategory,
  keywords,
  recommendedTimeSec,
  difficultyLabel,
  readingBody,
  suppressReadingBody,
  readingDiagram,
  readingDiagramUrl,
  passage,
  referenceView,
  choices,
  name,
  value,
  onChange,
  disabled,
  showCorrect,
  correctAnswer,
  noChoicesContent,
}: Props) {
  const opts = parseChoices(choices)
  const hasReadingText = Boolean(readingBody?.trim())
  const hasReadingDiagrams = Boolean(readingDiagram?.trim() || readingDiagramUrl?.trim())
  const hasReading = hasReadingText || hasReadingDiagrams
  const showReadingHere = hasReading && !suppressReadingBody
  const instructionLabel = hasReading ? '발문' : '지시문'
  const passageLabel = '지문'
  const metaParts: string[] = []
  if (problemNumber != null && problemNumber > 0) metaParts.push(`문제 ${problemNumber}`)
  if (questionCategory?.trim()) metaParts.push(questionCategory.trim())
  const diffStr = formatDifficulty(difficultyLabel)
  if (diffStr) metaParts.push(`난이도 ${diffStr}`)
  if (recommendedTimeSec != null && recommendedTimeSec > 0) {
    const m = Math.round(recommendedTimeSec / 60)
    metaParts.push(m >= 1 ? `권장 ${m}분` : `권장 ${recommendedTimeSec}초`)
  }
  const kw = keywords?.filter(Boolean) ?? []

  return (
    <div className="problem-renderer">
      {metaParts.length > 0 || kw.length > 0 ? (
        <div className="problem-renderer__meta" aria-label="문항 정보">
          {metaParts.length > 0 ? (
            <p className="problem-renderer__meta-line">{metaParts.join(' · ')}</p>
          ) : null}
          {kw.length > 0 ? (
            <ul className="problem-renderer__keywords">
              {kw.map((k, i) => (
                <li key={`${k}-${i}`} className="problem-renderer__keyword">
                  {k}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {showReadingHere ? (
        <div className="problem-renderer__reading problem-renderer__reading--inline">
          <p className="problem-renderer__label">본문</p>
          {hasReadingText ? (
            <div className="problem-renderer__body">{renderExamRichText(readingBody!.trim())}</div>
          ) : null}
          <ReadingBodyDiagrams
            diagram={readingDiagram}
            diagramUrl={readingDiagramUrl}
            className="reading-body-diagrams problem-renderer__reading-diagrams"
          />
        </div>
      ) : null}
      {instructionText?.trim() ? (
        <div className="problem-renderer__instruction">
          <p className="problem-renderer__label">{instructionLabel}</p>
          <div className="problem-renderer__body">{renderExamRichText(instructionText.trim())}</div>
        </div>
      ) : null}
      {passage ? (
        <div className="problem-renderer__passage">
          <p className="problem-renderer__label">{passageLabel}</p>
          <div className="problem-renderer__body">{renderExamRichText(passage)}</div>
        </div>
      ) : null}
      {referenceView ? (
        <div className="problem-renderer__ref">
          <p className="problem-renderer__label">참고</p>
          <div className="problem-renderer__body problem-renderer__body--mono">
            {renderExamRichText(referenceView)}
          </div>
        </div>
      ) : null}
      {questionText?.trim() ? (
        <div className="problem-renderer__question">
          <p className="problem-renderer__label">문항</p>
          <div className="problem-renderer__qtext">{renderExamRichText(questionText.trim())}</div>
        </div>
      ) : null}
      {opts.length > 0 ? (
        <ul className="problem-renderer__choices" role="radiogroup" aria-label="선택지">
          {opts.map((o) => {
            const isCorrect = showCorrect && correctAnswer === o.id
            return (
              <li key={o.id}>
                <label
                  className={`problem-renderer__choice${isCorrect ? ' problem-renderer__choice--correct' : ''}`}
                >
                  <input
                    type="radio"
                    name={name}
                    value={o.id}
                    checked={value === o.id}
                    onChange={() => onChange(o.id)}
                    disabled={disabled}
                  />
                  <span className="problem-renderer__choice-rich">
                    {renderExamRichText(o.text, { softParagraphs: true, wrap: false })}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      ) : noChoicesContent != null ? (
        noChoicesContent
      ) : (
        <p className="problem-renderer__nochoices">객관식 선택지가 없습니다.</p>
      )}
    </div>
  )
}
