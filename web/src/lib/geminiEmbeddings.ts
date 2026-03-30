export type GeminiEmbedTaskType =
  | 'RETRIEVAL_QUERY'
  | 'RETRIEVAL_DOCUMENT'
  | 'SEMANTIC_SIMILARITY'
  | 'CLASSIFICATION'
  | 'CLUSTERING'

function parseSingleEmbedResponse(data: unknown): number[] | null {
  if (typeof data !== 'object' || data === null) return null
  const o = data as Record<string, unknown>
  const emb = o.embedding
  if (emb && typeof emb === 'object' && 'values' in emb) {
    const v = (emb as { values: unknown }).values
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'number') return v as number[]
  }
  return null
}

/** 단일 텍스트 임베딩 (질의용 등) */
export async function geminiEmbedContent(
  apiKey: string,
  modelId: string,
  text: string,
  taskType: GeminiEmbedTaskType,
): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:embedContent?key=${encodeURIComponent(apiKey)}`
  const baseBody: Record<string, unknown> = {
    model: `models/${modelId}`,
    content: { parts: [{ text }] },
  }
  const tryPost = async (body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data: unknown = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg =
        typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof (data as { error?: { message?: string } }).error?.message === 'string'
          ? (data as { error: { message: string } }).error.message
          : `임베딩 요청 실패 (${res.status})`
      throw new Error(msg)
    }
    return data
  }
  let data: unknown
  try {
    data = await tryPost({ ...baseBody, taskType })
  } catch (firstErr) {
    try {
      data = await tryPost(baseBody)
    } catch {
      throw firstErr
    }
  }
  const vec = parseSingleEmbedResponse(data)
  if (!vec?.length) throw new Error('임베딩 응답에 벡터가 없습니다.')
  return vec
}

const BATCH_SIZE = 48

/** 여러 청크 배치 임베딩 (문서 코퍼스) */
async function postBatchEmbed(
  apiKey: string,
  modelId: string,
  slice: string[],
  taskType: GeminiEmbedTaskType | undefined,
): Promise<number[][]> {
  const model = `models/${modelId}`
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`
  const requests = slice.map((t) => {
    const req: Record<string, unknown> = {
      model,
      content: { parts: [{ text: t }] },
    }
    if (taskType) req.taskType = taskType
    return req
  })
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof (data as { error?: { message?: string } }).error?.message === 'string'
        ? (data as { error: { message: string } }).error.message
        : `배치 임베딩 실패 (${res.status})`
    throw new Error(msg)
  }
  const root = data as { embeddings?: { values?: number[] }[] }
  const batch = root.embeddings
  if (!Array.isArray(batch) || batch.length !== slice.length) {
    throw new Error('배치 임베딩 응답 개수가 요청과 맞지 않습니다.')
  }
  const out: number[][] = []
  for (const e of batch) {
    if (!e?.values?.length) throw new Error('배치 임베딩에 빈 벡터가 있습니다.')
    out.push(e.values)
  }
  return out
}

export async function geminiBatchEmbedContents(
  apiKey: string,
  modelId: string,
  texts: string[],
  taskType: GeminiEmbedTaskType,
): Promise<number[][]> {
  const out: number[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE)
    try {
      out.push(...(await postBatchEmbed(apiKey, modelId, slice, taskType)))
    } catch (firstErr) {
      try {
        out.push(...(await postBatchEmbed(apiKey, modelId, slice, undefined)))
      } catch {
        throw firstErr
      }
    }
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 80))
    }
  }
  return out
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const d = Math.sqrt(na) * Math.sqrt(nb)
  return d === 0 ? 0 : dot / d
}
