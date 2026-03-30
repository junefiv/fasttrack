import { Button, Group, Loader, Stack, Text, TextInput } from '@mantine/core'
import { mergeRefs, useResizeObserver } from '@mantine/hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import '../../lib/pdfWorkerConfig'
import { supabase } from '../../lib/supabase'
import type { LearningResource } from '../../types/lectures'
import './EbookDrawer.css'

type BubbleState = { left: number; top: number; text: string; page: number }

export type PdfReaderToolbarApi = {
  currentPage: number
  numPages: number
  goPage: (p: number) => void
}

type Props = {
  lectureId: string
  /** PDF에서 텍스트 드래그 후 말풍선에서 호출 → 질문 Drawer 열기 (RAG용 pdf_url·페이지 번호 포함) */
  onOpenQuestionFromSelection?: (selectedText: string, pdfUrl: string, pageNumber: number) => void
  /** Mantine Drawer 제목 옆 페이지 네비용 (연결 교재 헤더 등) */
  onPdfToolbar?: (api: PdfReaderToolbarApi | null) => void
}

/** Drawer 제목 줄(연결 교재 · …) 옆에 붙이는 PDF 페이지 이동 */
export function EbookPdfPageNav({ api }: { api: PdfReaderToolbarApi }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const focusedRef = useRef(false)
  const [pageDraft, setPageDraft] = useState(() =>
    api.numPages > 0 ? String(api.currentPage) : '',
  )

  useEffect(() => {
    if (focusedRef.current) return
    if (api.numPages > 0) setPageDraft(String(api.currentPage))
    else setPageDraft('')
  }, [api.currentPage, api.numPages])

  const commitPageFromDraft = useCallback(() => {
    if (api.numPages < 1) return
    const raw = pageDraft.replace(/\D/g, '')
    const n = raw === '' ? NaN : Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) return
    const clamped = Math.min(api.numPages, Math.max(1, n))
    api.goPage(clamped)
    setPageDraft(String(clamped))
  }, [api, pageDraft])

  return (
    <nav className="edraw__pdf-header-nav" aria-label="PDF 페이지 이동">
      <Group gap={6} wrap="nowrap" className="edraw__pdf-header-nav-inner">
        <Button
          type="button"
          variant="default"
          size="compact-sm"
          disabled={api.numPages < 1 || api.currentPage <= 1}
          onClick={() => api.goPage(api.currentPage - 1)}
        >
          이전
        </Button>
        {api.numPages > 0 ? (
          <Group gap={4} wrap="nowrap" align="center" className="edraw__pdf-nav-row">
           
            <TextInput
              ref={inputRef}
              classNames={{ input: 'edraw__pdf-page-input' }}
              size="xs"
              aria-label="이동할 페이지 번호"
              value={pageDraft}
              onChange={(e) => setPageDraft(e.currentTarget.value)}
              onFocus={() => {
                focusedRef.current = true
              }}
              onBlur={() => {
                focusedRef.current = false
                setPageDraft(String(api.currentPage))
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                commitPageFromDraft()
                inputRef.current?.blur()
              }}
            />
            <Text component="span" size="sm" c="dimmed">
              / {api.numPages}
            </Text>
          </Group>
        ) : (
          <Text component="span" size="sm" c="dimmed" className="edraw__pdf-nav-label">
            페이지 — / —
          </Text>
        )}
        <Button
          type="button"
          variant="default"
          size="compact-sm"
          disabled={api.numPages < 1 || api.currentPage >= api.numPages}
          onClick={() => api.goPage(api.currentPage + 1)}
        >
          다음
        </Button>
      </Group>
    </nav>
  )
}

type PdfReaderProps = {
  url: string
  title: string
  onOpenQuestionFromSelection?: (selectedText: string, pdfUrl: string, pageNumber: number) => void
  /** 드로어 헤더에 페이지 이동 UI를 올릴 때 사용 */
  onToolbar?: (api: PdfReaderToolbarApi | null) => void
  /** 페이지 렌더 최대 너비(px) — 컬럼이 넓을수록 크게 */
  maxPageWidth?: number
}

function PdfReader({
  url,
  title,
  onOpenQuestionFromSelection,
  onToolbar,
  maxPageWidth = 720,
}: PdfReaderProps) {
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [bubble, setBubble] = useState<BubbleState | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const selTimerRef = useRef<number | null>(null)

  const [roRef, rect] = useResizeObserver()
  const pageWidth = Math.max(260, Math.min(maxPageWidth, (rect?.width ?? 520) - 12))

  useEffect(() => {
    setNumPages(0)
    setPdfError(null)
    setBubble(null)
    setCurrentPage(1)
  }, [url])

  const goPage = useCallback(
    (p: number) => {
      if (numPages < 1) return
      const next = Math.max(1, Math.min(numPages, p))
      scrollRef.current
        ?.querySelector<HTMLElement>(`[data-edraw-page="${next}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setCurrentPage(next)
    },
    [numPages],
  )

  useEffect(() => {
    const root = scrollRef.current
    if (!root || numPages < 1) return
    const nodes = root.querySelectorAll<HTMLElement>('[data-edraw-page]')
    if (nodes.length === 0) return

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const el = visible[0]?.target as HTMLElement | undefined
        const p = el ? Number(el.dataset.edrawPage) : NaN
        if (!Number.isNaN(p) && p >= 1) setCurrentPage(p)
      },
      { root, rootMargin: '-12% 0px -42% 0px', threshold: [0, 0.2, 0.45] },
    )
    nodes.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [numPages, url])

  useEffect(() => {
    if (!onToolbar) return
    onToolbar({ currentPage, numPages, goPage })
    return () => onToolbar(null)
  }, [onToolbar, currentPage, numPages, goPage])

  const updateBubbleFromSelection = useCallback(() => {
    if (!onOpenQuestionFromSelection) {
      setBubble(null)
      return
    }
    const root = wrapRef.current
    if (!root) return

    if (selTimerRef.current != null) {
      window.clearTimeout(selTimerRef.current)
      selTimerRef.current = null
    }

    const apply = () => {
      selTimerRef.current = null
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount < 1) {
        setBubble(null)
        return
      }
      const text = sel.toString().replace(/\s+/g, ' ').trim()
      if (text.length < 2) {
        setBubble(null)
        return
      }
      const range = sel.getRangeAt(0)
      const common = range.commonAncestorContainer
      const commonEl =
        common.nodeType === Node.TEXT_NODE ? common.parentElement : (common as Element)
      if (!commonEl || !root.contains(commonEl)) {
        setBubble(null)
        return
      }
      const r = range.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) {
        setBubble(null)
        return
      }
      let pageNum = currentPage
      const pageWrap = commonEl.closest('[data-edraw-page]')
      if (pageWrap) {
        const ds = pageWrap.getAttribute('data-edraw-page')
        if (ds) {
          const n = Number(ds)
          if (!Number.isNaN(n) && n >= 1) pageNum = n
        }
      }
      setBubble({
        left: r.left + r.width / 2,
        top: r.top,
        text,
        page: pageNum,
      })
    }

    selTimerRef.current = window.setTimeout(apply, 50)
  }, [onOpenQuestionFromSelection, currentPage])

  useEffect(() => {
    document.addEventListener('selectionchange', updateBubbleFromSelection)
    document.addEventListener('mouseup', updateBubbleFromSelection)
    return () => {
      document.removeEventListener('selectionchange', updateBubbleFromSelection)
      document.removeEventListener('mouseup', updateBubbleFromSelection)
      if (selTimerRef.current != null) window.clearTimeout(selTimerRef.current)
    }
  }, [updateBubbleFromSelection])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (bubbleRef.current?.contains(t)) return
      setBubble(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <article className="edraw__page edraw__page--pdf" aria-label={title}>
      <div ref={mergeRefs(roRef, scrollRef)} className="edraw__pdf-scroll">
        <div ref={wrapRef} className="edraw__pdf-doc">
          {pdfError ? (
            <Text size="sm" c="red">
              {pdfError}
            </Text>
          ) : (
            <Document
              file={url}
              loading={
                <Stack align="center" py="xl">
                  <Loader size="sm" color="teal" />
                  <Text size="sm" c="dimmed">
                    PDF 불러오는 중…
                  </Text>
                </Stack>
              }
              onLoadSuccess={({ numPages: n }) => {
                setPdfError(null)
                setNumPages(n)
              }}
              onLoadError={(err) => {
                setNumPages(0)
                setPdfError(err.message || 'PDF를 열 수 없습니다. (CORS·URL 확인)')
              }}
            >
              {numPages > 0
                ? Array.from({ length: numPages }, (_, i) => {
                    const n = i + 1
                    return (
                      <div
                        key={n}
                        id={`edraw-pdf-page-${n}`}
                        className="edraw__pdf-page-wrap"
                        data-edraw-page={n}
                      >
                        <Page
                          pageNumber={n}
                          width={pageWidth}
                          renderTextLayer
                          renderAnnotationLayer
                          className="edraw__pdf-page"
                        />
                      </div>
                    )
                  })
                : null}
            </Document>
          )}
        </div>
      </div>

      {bubble && onOpenQuestionFromSelection && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={bubbleRef}
              className="edraw__sel-bubble"
              style={{ left: bubble.left, top: bubble.top }}
              role="dialog"
              aria-label="선택 영역 질문"
            >
              <Button
                type="button"
                size="compact-sm"
                color="teal"
                variant="filled"
            onClick={() => {
              onOpenQuestionFromSelection(bubble.text, url, bubble.page)
              window.getSelection()?.removeAllRanges()
              setBubble(null)
            }}
              >
                질문하기
              </Button>
            </div>,
            document.body,
          )
        : null}
    </article>
  )
}

/** 연결 교재 — PDF 뷰어 + 드래그 선택 시 질문하기 말풍선 */
export function EbookDrawerPanel({
  lectureId,
  onOpenQuestionFromSelection,
  onPdfToolbar,
}: Props) {
  const [rows, setRows] = useState<LearningResource[]>([])
  const [load, setLoad] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoad('loading')
    setErrMsg(null)
    setRows([])
    setActiveId(null)

    void (async () => {
      if (!lectureId) {
        if (cancelled) return
        setLoad('err')
        setErrMsg('강좌 정보를 찾을 수 없습니다.')
        return
      }

      const { data, error } = await supabase
        .from('learning_resources')
        .select('id, lecture_id, pdf_url, title')
        .eq('lecture_id', lectureId)
        .order('id')

      if (cancelled) return
      if (error) {
        setLoad('err')
        setErrMsg(error.message)
        return
      }
      const list = (data ?? []) as LearningResource[]
      setRows(list)
      setActiveId(list[0]?.id ?? null)
      setLoad('ok')
    })()

    return () => {
      cancelled = true
    }
  }, [lectureId])

  const active = rows.find((r) => r.id === activeId) ?? null

  const labelFor = useCallback((r: LearningResource, index: number) => {
    const t = r.title?.trim()
    if (t) return t
    return `PDF 자료 ${index + 1}`
  }, [])

  return (
    <div className="edraw-panel">
      {load === 'loading' ? (
        <Stack align="center" py="xl" gap="sm">
          <Loader size="sm" color="teal" />
          <Text size="sm" c="dimmed">
            자료를 불러오는 중…
          </Text>
        </Stack>
      ) : null}

      {load === 'err' ? (
        <Text size="sm" c="red" py="md">
          {errMsg ?? '자료를 불러오지 못했습니다.'}
        </Text>
      ) : null}

      {load === 'ok' && rows.length === 0 ? (
        <Text size="sm" c="dimmed" py="md">
          이 강좌에 등록된 PDF 자료가 없습니다.
        </Text>
      ) : null}

      {load === 'ok' && rows.length > 0 ? (
        <>
          {rows.length > 1 ? (
            <nav className="edraw__toc" aria-label="자료 목록">
              {rows.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  className={`edraw__toc-item${r.id === activeId ? ' edraw__toc-item--active' : ''}`}
                  onClick={() => setActiveId(r.id)}
                >
                  {labelFor(r, i)}
                </button>
              ))}
            </nav>
          ) : null}

          {active ? (
            <PdfReader
              url={active.pdf_url}
              title={labelFor(active, rows.indexOf(active))}
              onOpenQuestionFromSelection={onOpenQuestionFromSelection}
              onToolbar={onPdfToolbar}
              maxPageWidth={900}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
