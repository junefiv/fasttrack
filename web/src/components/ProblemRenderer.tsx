import type { ChoiceOption } from '../types/fasttrack'
import './ProblemRenderer.css'

function parseChoices(raw: unknown): ChoiceOption[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw
      .map((item): ChoiceOption | null => {
        if (item && typeof item === 'object' && 'id' in item && 'text' in item) {
          const o = item as { id: unknown; text: unknown }
          return { id: String(o.id), text: String(o.text) }
        }
        return null
      })
      .filter((x): x is ChoiceOption => x !== null)
  }
  return []
}

type Props = {
  questionText: string
  instructionText?: string | null
  problemNumber?: number | null
  questionCategory?: string | null
  keywords?: string[] | null
  recommendedTimeSec?: number | null
  difficultyLabel?: string | null
  passage?: string | null
  referenceView?: string | null
  choices: unknown
  name: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  showCorrect?: boolean
  correctAnswer?: string
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
  passage,
  referenceView,
  choices,
  name,
  value,
  onChange,
  disabled,
  showCorrect,
  correctAnswer,
}: Props) {
  const opts = parseChoices(choices)
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
      {instructionText?.trim() ? (
        <div className="problem-renderer__instruction">
          <p className="problem-renderer__label">지시문</p>
          <div className="problem-renderer__body">{instructionText.trim()}</div>
        </div>
      ) : null}
      {passage ? (
        <div className="problem-renderer__passage">
          <p className="problem-renderer__label">지문</p>
          <div className="problem-renderer__body">{passage}</div>
        </div>
      ) : null}
      {referenceView ? (
        <div className="problem-renderer__ref">
          <p className="problem-renderer__label">참고</p>
          <div className="problem-renderer__body problem-renderer__body--mono">{referenceView}</div>
        </div>
      ) : null}
      {questionText?.trim() ? (
        <div className="problem-renderer__question">
          <p className="problem-renderer__label">문항</p>
          <p className="problem-renderer__qtext">{questionText.trim()}</p>
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
                  <span>{o.text}</span>
                </label>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="problem-renderer__nochoices">객관식 선택지가 없습니다.</p>
      )}
    </div>
  )
}
