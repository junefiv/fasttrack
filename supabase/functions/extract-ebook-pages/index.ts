/**
 * learning_resources INSERT/UPDATE 시 pdf_url에서 텍스트 추출 → ebook_pages 적재
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 선택: EBOOK_EXTRACTION_SECRET — 설정 시 요청 헤더 x-ebook-secret 가 일치해야 함
 * 스키마:
 *   EBOOK_PAGES_SCHEMA=production → ebook_pages(resource_id, lecture_session_id, page_number, extracted_text, …)
 *     + EBOOK_DEFAULT_LECTURE_SESSION_ID (필수)
 *   기본(legacy) → ebook_pages(learning_resource_id, page_number, body)
 *   LEARNING_RESOURCES_HAS_EXTRACT_META=false → ebook_text_extracted_at 컬럼 없을 때 updated_at 만 갱신
 *
 * 호출:
 * - Postgres 트리거 + pg_net (마이그레이션 20260327250000) → JSON { "learning_resource_id": "<uuid>" }
 * - Database Webhook (payload: { type, table, record, old_record })
 * - 수동 POST JSON: { "learning_resource_id": "<uuid>" }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { extractText } from 'npm:unpdf@1.4.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ebook-secret',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const secret = Deno.env.get('EBOOK_EXTRACTION_SECRET')
  if (secret) {
    const h = req.headers.get('x-ebook-secret')
    if (h !== secret) return json({ error: 'unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }

  const sb = createClient(supabaseUrl, serviceKey)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  let learningResourceId: string | null = null
  let recordPdfUrl: string | null = null
  let skipReason: string | null = null

  if (typeof body.learning_resource_id === 'string') {
    learningResourceId = body.learning_resource_id
  } else if (body.table === 'learning_resources' && body.record && typeof body.record === 'object') {
    const rec = body.record as Record<string, unknown>
    const old = body.old_record as Record<string, unknown> | null | undefined
    if (typeof rec.id === 'string') learningResourceId = rec.id
    if (typeof rec.pdf_url === 'string') recordPdfUrl = rec.pdf_url
    if (body.type === 'UPDATE' && old && typeof old.pdf_url === 'string' && old.pdf_url === recordPdfUrl) {
      skipReason = 'pdf_url unchanged'
    }
  }

  if (skipReason) return json({ ok: true, skipped: true, reason: skipReason })

  if (!learningResourceId) return json({ error: 'missing learning_resource_id or webhook record' }, 400)

  let pdfUrl = recordPdfUrl
  if (!pdfUrl) {
    const { data: row, error } = await sb
      .from('learning_resources')
      .select('pdf_url')
      .eq('id', learningResourceId)
      .single()
    if (error || !row?.pdf_url) {
      return json({ error: 'learning_resource not found or pdf_url empty', details: error?.message }, 404)
    }
    pdfUrl = row.pdf_url as string
  }

  if (!pdfUrl.trim()) {
    return json({ error: 'pdf_url empty' }, 400)
  }

  try {
    const pdfRes = await fetch(pdfUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FasttrackEbookExtractor/1.0; +https://supabase.com)',
        Accept: 'application/pdf,*/*',
      },
    })
    if (!pdfRes.ok) {
      throw new Error(`PDF HTTP ${pdfRes.status}`)
    }
    const buf = new Uint8Array(await pdfRes.arrayBuffer())
    if (buf.byteLength < 64) throw new Error('PDF payload too small')

    const { totalPages, text } = await extractText(buf, { mergePages: false })
    const pageTexts = Array.isArray(text) ? text : [String(text)]

    const pageRows: { page_number: number; body: string }[] = []
    for (let i = 0; i < pageTexts.length; i++) {
      const raw = pageTexts[i] ?? ''
      const bodyText = raw.replace(/\s+/g, ' ').trim()
      if (bodyText.length > 0) {
        pageRows.push({
          page_number: i + 1,
          body: bodyText,
        })
      }
    }

    if (pageRows.length === 0 && totalPages > 0) {
      const merged = await extractText(buf, { mergePages: true })
      const t = typeof merged.text === 'string' ? merged.text : String(merged.text)
      const bodyText = t.replace(/\s+/g, ' ').trim()
      if (bodyText.length > 0) {
        pageRows.push({
          page_number: 1,
          body: bodyText,
        })
      }
    }

    const pagesSchema = (Deno.env.get('EBOOK_PAGES_SCHEMA') ?? 'legacy').toLowerCase()
    const useProduction =
      pagesSchema === 'production' || pagesSchema === 'prod' || pagesSchema === 'resource_id'

    if (useProduction) {
      const sessionId = Deno.env.get('EBOOK_DEFAULT_LECTURE_SESSION_ID')?.trim()
      if (!sessionId) {
        throw new Error(
          'EBOOK_PAGES_SCHEMA=production 일 때 Edge Secret EBOOK_DEFAULT_LECTURE_SESSION_ID 가 필요합니다.',
        )
      }
      await sb.from('ebook_pages').delete().eq('resource_id', learningResourceId)
      if (pageRows.length > 0) {
        const now = new Date().toISOString()
        const ins = pageRows.map((r) => ({
          resource_id: learningResourceId,
          lecture_session_id: sessionId,
          page_number: r.page_number,
          extracted_text: r.body,
          page_image_url: null as string | null,
          created_at: now,
          updated_at: now,
        }))
        const { error: insErr } = await sb.from('ebook_pages').insert(ins)
        if (insErr) throw new Error(insErr.message)
      }
    } else {
      await sb.from('ebook_pages').delete().eq('learning_resource_id', learningResourceId)
      if (pageRows.length > 0) {
        const legacyRows = pageRows.map((r) => ({
          learning_resource_id: learningResourceId,
          page_number: r.page_number,
          body: r.body,
        }))
        const { error: insErr } = await sb.from('ebook_pages').insert(legacyRows)
        if (insErr) throw new Error(insErr.message)
      }
    }

    const hasExtractMeta = Deno.env.get('LEARNING_RESOURCES_HAS_EXTRACT_META') !== 'false'
    if (hasExtractMeta) {
      await sb
        .from('learning_resources')
        .update({
          ebook_text_extracted_at: new Date().toISOString(),
          ebook_text_extract_error: null,
        })
        .eq('id', learningResourceId)
    } else {
      await sb.from('learning_resources').update({ updated_at: new Date().toISOString() }).eq('id', learningResourceId)
    }

    return json({
      ok: true,
      learning_resource_id: learningResourceId,
      pages_inserted: pageRows.length,
      total_pages: totalPages,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const hasExtractMeta = Deno.env.get('LEARNING_RESOURCES_HAS_EXTRACT_META') !== 'false'
    if (hasExtractMeta) {
      await sb.from('learning_resources').update({ ebook_text_extract_error: msg }).eq('id', learningResourceId)
    } else {
      await sb.from('learning_resources').update({ updated_at: new Date().toISOString() }).eq('id', learningResourceId)
    }
    return json({ ok: false, error: msg }, 500)
  }
})
