import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  fetchChaptersForSubject,
  fetchProblemsBank,
  fetchSectionsForSubject,
  fetchSubjects,
  insertDrillFromProblem,
} from '../../lib/fasttrackQueries'
import type { FasttrackProblemRow, SubjectRow } from '../../types/fasttrack'
import './QuestionBankPage.css'

export function QuestionBankPage() {
  const [searchParams] = useSearchParams()
  const subjectFromQuery = searchParams.get('subject')

  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [subjectId, setSubjectId] = useState('')
  const [chapterId, setChapterId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [problemType, setProblemType] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [search, setSearch] = useState('')
  const [chapters, setChapters] = useState<{ id: string; name: string }[]>([])
  const [sections, setSections] = useState<{ id: string; name: string }[]>([])
  const [rows, setRows] = useState<FasttrackProblemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let c = false
    ;(async () => {
      const s = await fetchSubjects()
      if (c) return
      setSubjects(s)
      if (subjectFromQuery && s.some((x) => x.id === subjectFromQuery)) {
        setSubjectId(subjectFromQuery)
      } else if (s[0]) {
        setSubjectId((prev) => prev || s[0].id)
      }
    })()
    return () => {
      c = true
    }
  }, [subjectFromQuery])

  useEffect(() => {
    if (!subjectId) return
    let c = false
    ;(async () => {
      const [ch, se] = await Promise.all([
        fetchChaptersForSubject(subjectId),
        fetchSectionsForSubject(subjectId),
      ])
      if (c) return
      setChapters((ch as { id: string; name: string }[]) ?? [])
      setSections((se as { id: string; name: string }[]) ?? [])
      setChapterId('')
      setSectionId('')
    })()
    return () => {
      c = true
    }
  }, [subjectId])

  useEffect(() => {
    let c = false
    ;(async () => {
      setLoading(true)
      try {
        const list = await fetchProblemsBank({
          subjectId: subjectId || undefined,
          chapterId: chapterId || undefined,
          sectionId: sectionId || undefined,
          problemType: problemType || undefined,
          difficulty: difficulty || undefined,
          search: search || undefined,
        })
        if (!c) setRows(list)
      } finally {
        if (!c) setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [subjectId, chapterId, sectionId, problemType, difficulty, search])

  async function addToDrill(problemId: string, version: 'upper' | 'lower') {
    setBusyId(problemId + version)
    setMsg(null)
    try {
      const row = await insertDrillFromProblem(problemId, version)
      setMsg(`드릴에 추가했습니다. /study/mock-exam/drill?ids=${row.id} 로 이동할 수 있습니다.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '실패')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="qbank">
      <header className="qbank__head">
        <p className="qbank__eyebrow">Study Room</p>
        <h1 className="qbank__title">문제은행</h1>
        <Link to="/study/mock-exam" className="qbank__back">
          모의고사 &amp; 드릴 홈
        </Link>
      </header>

      <div className="qbank__filters">
        <input
          type="search"
          className="qbank__search"
          placeholder="지문·문항 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="검색"
        />
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} aria-label="과목">
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} aria-label="세부과목">
          <option value="">전체 챕터</option>
          {chapters.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {ch.name}
            </option>
          ))}
        </select>
        <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} aria-label="섹션">
          <option value="">전체 섹션</option>
          {sections.map((se) => (
            <option key={se.id} value={se.id}>
              {se.name}
            </option>
          ))}
        </select>
        <select value={problemType} onChange={(e) => setProblemType(e.target.value)} aria-label="유형">
          <option value="">전체 유형</option>
          <option value="multiple">객관식</option>
          <option value="subjective">주관식</option>
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="난이도">
          <option value="">전체 난이도</option>
          <option value="easy">쉬움</option>
          <option value="medium">보통</option>
          <option value="hard">어려움</option>
        </select>
      </div>

      {msg ? <p className="qbank__msg">{msg}</p> : null}

      {loading ? (
        <p className="qbank__muted">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="qbank__muted">조건에 맞는 문제가 없습니다.</p>
      ) : (
        <ul className="qbank__grid">
          {rows.map((p) => (
            <li key={p.id} className="qbank__card">
              <p className="qbank__preview">{p.question_text}</p>
              <p className="qbank__tags">
                {p.problem_type} · {p.difficulty}
              </p>
              <div className="qbank__actions">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void addToDrill(p.id, 'upper')}
                >
                  {busyId === p.id + 'upper' ? '…' : '상위 드릴에 추가'}
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void addToDrill(p.id, 'lower')}
                >
                  {busyId === p.id + 'lower' ? '…' : '하위 드릴에 추가'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
