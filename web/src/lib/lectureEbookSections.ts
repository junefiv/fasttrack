import type { SupabaseClient } from '@supabase/supabase-js'
import type { LectureEbookSection } from '../types/lectures'

/**
 * 강좌에 연결된 교재의 DB 추출 본문(ebook_pages)을 LLM용 섹션 목록으로 만든다.
 */
export async function fetchLectureEbookSections(
  client: SupabaseClient,
  lectureId: string,
): Promise<LectureEbookSection[]> {
  if (!lectureId) return []

  const { data: resources, error: lrErr } = await client
    .from('learning_resources')
    .select('id,title')
    .eq('lecture_id', lectureId)
    .order('id')

  if (lrErr || !resources?.length) return []

  const ids = resources.map((r) => r.id as string)
  const { data: pages, error: pErr } = await client
    .from('ebook_pages')
    .select('learning_resource_id,page_number,body')
    .in('learning_resource_id', ids)

  if (pErr || !pages?.length) return []

  const titleById = new Map(
    resources.map((r) => [r.id as string, (r.title as string | null)?.trim() || '교재']),
  )
  const orderIdx = new Map(ids.map((id, i) => [id, i]))

  const sorted = [...pages].sort((a, b) => {
    const ra = a.learning_resource_id as string
    const rb = b.learning_resource_id as string
    const c = (orderIdx.get(ra) ?? 0) - (orderIdx.get(rb) ?? 0)
    if (c !== 0) return c
    return (a.page_number as number) - (b.page_number as number)
  })

  return sorted.map((p) => {
    const rid = p.learning_resource_id as string
    const n = p.page_number as number
    const base = titleById.get(rid) ?? '교재'
    return {
      id: `${rid}:${n}`,
      title: `${base} · p.${n}`,
      pageStart: n,
      pageEnd: n,
      body: (p.body as string) ?? '',
    }
  })
}
