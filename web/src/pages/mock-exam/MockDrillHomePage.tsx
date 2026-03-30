import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  fetchChapterNamesMap,
  fetchDrillsForSubject,
  fetchMockExamCatalog,
  fetchSubjects,
} from '../../lib/fasttrackQueries'
import { resolveMockExamCatalogImage } from '../../lib/mockExamCatalogImages'
import type { FasttrackDrillProblemRow, FasttrackMockExamCatalogRow, SubjectRow } from '../../types/fasttrack'
import './MockDrillHomePage.css'

type HubTab = 'mock' | 'practice'

function tabFromSearch(params: URLSearchParams): HubTab {
  return params.get('tab') === 'practice' ? 'practice' : 'mock'
}

export function MockDrillHomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const hubTab = tabFromSearch(searchParams)

  const setHubTab = (next: HubTab) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'mock') p.delete('tab')
        else p.set('tab', 'practice')
        return p
      },
      { replace: true },
    )
  }

  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<SubjectRow[]>([])
  const [catalog, setCatalog] = useState<FasttrackMockExamCatalogRow[]>([])
  const [drills, setDrills] = useState<FasttrackDrillProblemRow[]>([])
  const [chapterNames, setChapterNames] = useState<Map<string, string>>(new Map())
  const [err, setErr] = useState<string | null>(null)

  const activeSubjectId = selectedSubjectId

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const subj = await fetchSubjects()
        if (cancelled) return
        setSubjects(subj)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '과목 불러오기 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (subjects.length === 0) {
      setSelectedSubjectId(null)
      return
    }
    setSelectedSubjectId((prev) => {
      if (prev != null && subjects.some((s) => s.id === prev)) return prev
      return subjects[0]!.id
    })
  }, [subjects])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!activeSubjectId || hubTab !== 'mock') {
          if (!cancelled) setCatalog([])
          return
        }
        const list = await fetchMockExamCatalog(activeSubjectId)
        if (!cancelled) setCatalog(list)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '모의고사 목록 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeSubjectId, hubTab])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!activeSubjectId || hubTab !== 'practice') {
          if (!cancelled) {
            setDrills([])
            setChapterNames(new Map())
          }
          return
        }
        const dr = await fetchDrillsForSubject(activeSubjectId, 8)
        if (cancelled) return
        setDrills(dr.slice(0, 3))
        const chIds = dr.slice(0, 3).map((d) => d.chapter_id)
        const cmap = await fetchChapterNamesMap(chIds)
        if (!cancelled) setChapterNames(cmap)
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : '드릴 목록 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeSubjectId, hubTab])

  const subject = subjects.find((s) => s.id === activeSubjectId)
  const bankHref =
    activeSubjectId != null
      ? `/study/mock-exam/bank?subject=${encodeURIComponent(activeSubjectId)}`
      : '/study/mock-exam/bank'

  return (
    <div className="mock-home">
      <header className="mock-home__head">
        <p className="mock-home__eyebrow">Study Room</p>
        <h1 className="mock-home__title">모의고사 &amp; 드릴</h1>
        <p className="mock-home__sub">
          모의고사 응시와 문제은행·개인화 드릴을 한 곳에서 이어갈 수 있습니다.
        </p>
      </header>

      {err ? <p className="mock-home__err">{err}</p> : null}

      <div className="mock-home__hub-tabs" role="tablist" aria-label="학습 유형">
        <button
          type="button"
          role="tab"
          id="mock-hub-tab-mock"
          aria-selected={hubTab === 'mock'}
          aria-controls="mock-hub-panel"
          className={`mock-home__hub-tab${hubTab === 'mock' ? ' mock-home__hub-tab--active' : ''}`}
          onClick={() => setHubTab('mock')}
        >
          모의고사
        </button>
        <button
          type="button"
          role="tab"
          id="mock-hub-tab-practice"
          aria-selected={hubTab === 'practice'}
          aria-controls="mock-hub-panel"
          className={`mock-home__hub-tab${hubTab === 'practice' ? ' mock-home__hub-tab--active' : ''}`}
          onClick={() => setHubTab('practice')}
        >
          문제은행 · 드릴학습
        </button>
      </div>

      <div
        id="mock-hub-panel"
        role="tabpanel"
        aria-labelledby={hubTab === 'mock' ? 'mock-hub-tab-mock' : 'mock-hub-tab-practice'}
        className="mock-home__hub-panel"
      >
        <div className="mock-home__subject-tabs" role="tablist" aria-label="과목">
          {subjects.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={selectedSubjectId === s.id}
              className={`mock-home__subject-tab${selectedSubjectId === s.id ? ' mock-home__subject-tab--active' : ''}`}
              onClick={() => setSelectedSubjectId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>

        {hubTab === 'mock' ? (
          <section className="mock-home__exam-section" aria-label="모의고사 목록">
            {!activeSubjectId ? (
              <p className="mock-home__muted">선택된 과목이 없습니다.</p>
            ) : catalog.length === 0 ? (
              <p className="mock-home__muted">이 과목에 등록된 모의고사가 없습니다.</p>
            ) : (
              <ul className="mock-home__catalog">
                {catalog.map((row) => {
                  const img = resolveMockExamCatalogImage(row.slug)
                  return (
                    <li key={row.id} className="mock-home__catalog-card">
                      <div className="mock-home__catalog-visual" aria-hidden={!img}>
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            className="mock-home__catalog-img"
                          />
                        ) : (
                          <div className="mock-home__catalog-placeholder" title={row.slug} />
                        )}
                      </div>
                      <div className="mock-home__catalog-body">
                        <strong className="mock-home__catalog-title">{row.title}</strong>
                        <p className="mock-home__catalog-desc">{row.description}</p>
                        <Link
                          to={
                            row.linked_mock_exam_id
                              ? `/study/mock-exam/mock/${row.linked_mock_exam_id}`
                              : `/study/mock-exam/preview/${row.id}`
                          }
                          className="mock-home__row-btn mock-home__catalog-cta"
                        >
                          {row.linked_mock_exam_id ? '응시하기' : 'UI 미리보기'}
                        </Link>
                        
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        ) : (
          <>
            <p className="mock-home__panel-hint">
              {subject ? (
                <>
                  <strong>{subject.name}</strong> 기준으로 문제은행과 드릴을 이용합니다.
                </>
              ) : (
                '과목을 선택하세요.'
              )}
            </p>

            <div className="mock-home__practice-block">
              <h2 className="mock-home__h2">문제은행</h2>
              <p className="mock-home__muted mock-home__practice-desc">
                유형·난이도 필터로 빠르게 검색합니다.
              </p>
              <Link to={bankHref} className="mock-home__primary-btn">
                문제은행 열기
              </Link>
            </div>

            <section className="mock-home__practice-block" aria-label="개인화 드릴">
              <h2 className="mock-home__h2">개인화 드릴</h2>
              <p className="mock-home__muted mock-home__practice-desc">
                상위·하위 변형 문제로 한 문항씩 연습합니다.
              </p>
              {!activeSubjectId ? (
                <p className="mock-home__muted">과목을 선택하면 드릴 목록이 표시됩니다.</p>
              ) : drills.length === 0 ? (
                <p className="mock-home__muted">이 과목에 등록된 드릴이 없습니다.</p>
              ) : (
                <ul className="mock-home__exam-rows">
                  {drills.map((d) => {
                    const ch = chapterNames.get(d.chapter_id)
                    return (
                      <li key={d.id} className="mock-home__exam-row">
                        <div>
                          <strong className="mock-home__exam-name">
                            {ch ? `${ch} ` : ''}
                            {d.version_type === 'upper' ? '상위' : '하위'} 드릴 (1문항)
                          </strong>
                          <p className="mock-home__exam-meta">난이도 {d.difficulty}</p>
                        </div>
                        <Link
                          to={`/study/mock-exam/drill?ids=${encodeURIComponent(d.id)}`}
                          className="mock-home__row-btn"
                        >
                          시작하기
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
