import type { SupabaseClient } from '@supabase/supabase-js'
import { extractPdfPlainText } from './pdfTextExtract'
import { cosineSimilarity, geminiBatchEmbedContents, geminiEmbedContent } from './geminiEmbeddings'

const CHUNK_SIZE = 950
const CHUNK_OVERLAP = 220
const MAX_CHUNKS = 320
const DEFAULT_TOP_K = 8
/** 페이지 RAG + 청크 RAG 조합 시 각각 상위 K */
const DEFAULT_TOP_K_PER_SOURCE = 6
const MAX_PAGE_EMBED_CHARS = 12_000

export type EbookRagIndex = {
  chunks: string[]
  embeddings: number[][]
}

export type EbookPageRagIndex = {
  pageNumbers: number[]
  /** 임베딩·발췌에 쓰는 본문(페이지 접두 포함) */
  texts: string[]
  embeddings: number[][]
}

const indexByUrl = new Map<string, Promise<EbookRagIndex>>()
const pageIndexByPdfUrl = new Map<string, Promise<EbookPageRagIndex | null>>()

function chunkPdfText(text: string): string[] {
  const t = text.replace(/\r\n/g, '\n').trim()
  if (!t) return []
  const out: string[] = []
  let i = 0
  while (i < t.length && out.length < MAX_CHUNKS) {
    const end = Math.min(t.length, i + CHUNK_SIZE)
    let slice = t.slice(i, end)
    if (end < t.length) {
      const cutCandidates = [
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('。'),
        slice.lastIndexOf('.'),
        slice.lastIndexOf('?'),
        slice.lastIndexOf('!'),
      ]
      const cut = Math.max(...cutCandidates)
      if (cut > CHUNK_SIZE * 0.35) slice = slice.slice(0, cut + 1)
    }
    const norm = slice.replace(/\s+/g, ' ').trim()
    if (norm.length >= 24) out.push(norm)
    if (end >= t.length) break
    i = Math.max(i + 1, end - CHUNK_OVERLAP)
  }
  return out
}

async function buildIndex(pdfUrl: string, apiKey: string, embeddingModel: string): Promise<EbookRagIndex> {
  const raw = await extractPdfPlainText(pdfUrl)
  const chunks = chunkPdfText(raw)
  if (chunks.length === 0) {
    return { chunks: [], embeddings: [] }
  }
  const embeddings = await geminiBatchEmbedContents(apiKey, embeddingModel, chunks, 'RETRIEVAL_DOCUMENT')
  return { chunks, embeddings }
}

/**
 * PDF URL당 한 번(메모리 캐시) 텍스트 추출 → 청크 → Gemini 임베딩 인덱스.
 */
export function getOrBuildEbookRagIndex(
  pdfUrl: string,
  apiKey: string,
  embeddingModel: string,
): Promise<EbookRagIndex> {
  const hit = indexByUrl.get(pdfUrl)
  if (hit) return hit
  const p = buildIndex(pdfUrl, apiKey, embeddingModel).catch((err) => {
    indexByUrl.delete(pdfUrl)
    throw err
  })
  indexByUrl.set(pdfUrl, p)
  return p
}

export function clearEbookRagIndexForUrl(pdfUrl: string): void {
  indexByUrl.delete(pdfUrl)
  pageIndexByPdfUrl.delete(pdfUrl)
}

async function buildEbookPageRagIndex(
  client: SupabaseClient,
  pdfUrl: string,
  apiKey: string,
  embeddingModel: string,
): Promise<EbookPageRagIndex | null> {
  const { data: lr, error: lrErr } = await client
    .from('learning_resources')
    .select('id')
    .eq('pdf_url', pdfUrl)
    .maybeSingle()

  if (lrErr || !lr?.id) return null

  const { data: pages, error: pErr } = await client
    .from('ebook_pages')
    .select('page_number,body')
    .eq('learning_resource_id', lr.id as string)
    .order('page_number')

  if (pErr || !pages?.length) return null

  const rows = pages.filter((p) => String((p as { body?: string }).body ?? '').trim().length > 0)
  if (rows.length === 0) return null

  const pageNumbers: number[] = []
  const texts: string[] = []
  for (const p of rows) {
    const n = (p as { page_number: number }).page_number
    let body = String((p as { body: string }).body).replace(/\s+/g, ' ').trim()
    if (body.length > MAX_PAGE_EMBED_CHARS) {
      body = `${body.slice(0, MAX_PAGE_EMBED_CHARS)}\n[…이 페이지는 길어 앞부분만 임베딩…]`
    }
    pageNumbers.push(n)
    texts.push(`페이지 ${n}:\n${body}`)
  }

  const embeddings = await geminiBatchEmbedContents(apiKey, embeddingModel, texts, 'RETRIEVAL_DOCUMENT')
  return { pageNumbers, texts, embeddings }
}

function getOrBuildEbookPageRagIndex(
  client: SupabaseClient,
  pdfUrl: string,
  apiKey: string,
  embeddingModel: string,
): Promise<EbookPageRagIndex | null> {
  const hit = pageIndexByPdfUrl.get(pdfUrl)
  if (hit) return hit
  const p = buildEbookPageRagIndex(client, pdfUrl, apiKey, embeddingModel).catch((err) => {
    pageIndexByPdfUrl.delete(pdfUrl)
    throw err
  })
  pageIndexByPdfUrl.set(pdfUrl, p)
  return p
}

/**
 * DB ebook_pages 한 페이지 = 한 문서로 임베딩 후 유사도 상위 K.
 */
export async function retrieveEbookPageChunksForQuestion(params: {
  client: SupabaseClient
  pdfUrl: string
  apiKey: string
  embeddingModel: string
  highlight: string
  userMessage: string
  topK?: number
}): Promise<string> {
  const {
    client,
    pdfUrl,
    apiKey,
    embeddingModel,
    highlight,
    userMessage,
    topK = DEFAULT_TOP_K_PER_SOURCE,
  } = params

  const index = await getOrBuildEbookPageRagIndex(client, pdfUrl, apiKey, embeddingModel)
  if (!index || index.texts.length === 0) {
    return '(해당 pdf_url의 learning_resources 또는 ebook_pages 행이 없습니다. URL 일치·텍스트 추출 파이프라인을 확인하세요.)'
  }

  const queryText = [highlight.trim(), userMessage.trim()].filter(Boolean).join('\n\n') || userMessage
  const qVec = await geminiEmbedContent(apiKey, embeddingModel, queryText, 'RETRIEVAL_QUERY')
  const scored = index.embeddings.map((emb, i) => ({ i, s: cosineSimilarity(qVec, emb) }))
  scored.sort((a, b) => b.s - a.s)
  const topIdxs: number[] = []
  for (let k = 0; k < Math.min(topK, scored.length); k++) topIdxs.push(scored[k].i)
  return topIdxs
    .map((idx, rank) => {
      const pn = index.pageNumbers[idx]
      return `--- 페이지 RAG ${rank + 1} · **p.${pn}** (유사도 ${rank + 1}위) ---\n${index.texts[idx]}`
    })
    .join('\n\n')
}

/**
 * (A) ebook_pages 페이지 단위 RAG + (B) PDF 전체 텍스트 청크 RAG 를 각각 검색해 조합.
 * 답변에서 페이지 인용을 유도하는 프롬프트와 함께 쓰도록 구성됨.
 */
export async function retrieveCombinedEbookRagForQuestion(params: {
  client: SupabaseClient
  pdfUrl: string
  apiKey: string
  embeddingModel: string
  highlight: string
  userMessage: string
  topKPerSource?: number
}): Promise<string> {
  const topK = params.topKPerSource ?? DEFAULT_TOP_K_PER_SOURCE
  const [pagePart, chunkPart] = await Promise.all([
    retrieveEbookPageChunksForQuestion({ ...params, topK }),
    retrieveEbookChunksForQuestion({ ...params, topK }),
  ])

  return [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '「A) DB ebook_pages — 페이지 단위 RAG」',
    '각 블록은 한 페이지 본문을 통째로 임베딩한 뒤 질의와의 유사도 상위입니다. **답변 시 근거 페이지를 말할 때 아래의 p.N 번호를 우선 사용하세요.**',
    pagePart,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '「B) PDF 전체 추출 텍스트 — 고정 길이 청크 RAG」',
    '약 ' + String(CHUNK_SIZE) + '자 단위로 나눈 청크입니다. 청크 번호만 있으며 페이지와 1:1이 아닙니다. 페이지 출처는 (A)를 우선하고, (A)가 없을 때만 (B)만으로 답하세요.',
    chunkPart,
  ].join('\n\n')
}

const RAG_COMBINED_INTRO =
  '(아래는 (A) DB ebook_pages를 페이지 단위로 임베딩해 검색한 결과와, (B) 동일 PDF 전체 텍스트를 고정 길이 청크로 나눠 검색한 결과를 합친 RAG 발췌입니다. 전체 교재가 아닙니다. 사용자에게 근거 페이지를 알려 줄 때는 (A)에 나온 **p.N** 번호를 우선 사용하세요.)'

export { RAG_COMBINED_INTRO }

/**
 * 강좌에 연결된 PDF가 여러 권이면 각각 (A)(B) 이중 RAG 후 이어붙임.
 */
export async function retrieveCombinedEbookRagForLecturePdfs(params: {
  client: SupabaseClient
  refs: { pdfUrl: string; title?: string | null }[]
  apiKey: string
  embeddingModel: string
  highlight: string
  userMessage: string
  topKPerSource?: number
}): Promise<string> {
  const { refs, client, apiKey, embeddingModel, highlight, userMessage, topKPerSource } = params
  const filtered = refs.map((r) => ({
    pdfUrl: String(r.pdfUrl ?? '').trim(),
    title: r.title,
  })).filter((r) => r.pdfUrl.length > 0)

  if (filtered.length === 0) {
    return '(강좌에 등록된 PDF 교재(pdf_url)가 없습니다.)'
  }

  const blocks = await Promise.all(
    filtered.map(async (ref, idx) => {
      const inner = await retrieveCombinedEbookRagForQuestion({
        client,
        pdfUrl: ref.pdfUrl,
        apiKey,
        embeddingModel,
        highlight,
        userMessage,
        topKPerSource,
      })
      const label = ref.title?.trim() || `교재 ${idx + 1}`
      return [`▶▶▶ 교재: ${label}`, `PDF: ${ref.pdfUrl}`, inner].join('\n')
    }),
  )

  return blocks.join('\n\n\n')
}

/**
 * 하이라이트 + 사용자 질문을 질의로 임베딩한 뒤, 코사인 유사도 상위 K 청크만 문자열로 반환.
 */
export async function retrieveEbookChunksForQuestion(params: {
  pdfUrl: string
  apiKey: string
  embeddingModel: string
  highlight: string
  userMessage: string
  topK?: number
}): Promise<string> {
  const { pdfUrl, apiKey, embeddingModel, highlight, userMessage, topK = DEFAULT_TOP_K } = params
  const index = await getOrBuildEbookRagIndex(pdfUrl, apiKey, embeddingModel)
  if (index.chunks.length === 0) {
    return '(PDF에서 추출한 텍스트가 없거나 너무 짧습니다. 스캔 PDF이거나 텍스트 레이어가 없을 수 있습니다.)'
  }
  const queryText = [highlight.trim(), userMessage.trim()].filter(Boolean).join('\n\n') || userMessage
  const qVec = await geminiEmbedContent(apiKey, embeddingModel, queryText, 'RETRIEVAL_QUERY')
  const scored = index.embeddings.map((emb, i) => ({
    i,
    s: cosineSimilarity(qVec, emb),
  }))
  scored.sort((a, b) => b.s - a.s)
  const pick = new Set<number>()
  for (let k = 0; k < Math.min(topK, scored.length); k++) pick.add(scored[k].i)
  const ordered = [...pick].sort((a, b) => a - b)
  return ordered
    .map((idx, rank) => `--- RAG 발췌 ${rank + 1} (청크 #${idx + 1}, 유사도 참고용) ---\n${index.chunks[idx]}`)
    .join('\n\n')
}
