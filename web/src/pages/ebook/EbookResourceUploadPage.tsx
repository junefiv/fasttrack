import {
  Alert,
  Button,
  FileInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Lecture } from '../../types/lectures'
import './EbookResourceUploadPage.css'

const BUCKET = 'ebook-pdfs'

function safePdfFileName(name: string): string {
  const base = name.replace(/^.*[/\\]/, '')
  const cleaned = base.replace(/[^\w.\-가-힣]+/g, '_')
  return cleaned.slice(0, 120) || 'document.pdf'
}

async function pollExtractMeta(
  resourceId: string,
  opts: { maxMs?: number; intervalMs?: number } = {},
): Promise<{ ok: true } | { error: string } | { pending: true }> {
  const maxMs = opts.maxMs ?? 180_000
  const intervalMs = opts.intervalMs ?? 2500
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    const { data, error } = await supabase
      .from('learning_resources')
      .select('ebook_text_extracted_at, ebook_text_extract_error')
      .eq('id', resourceId)
      .maybeSingle()
    if (error) return { error: error.message }
    const row = data as {
      ebook_text_extracted_at?: string | null
      ebook_text_extract_error?: string | null
    } | null
    if (row?.ebook_text_extract_error) return { error: row.ebook_text_extract_error }
    if (row?.ebook_text_extracted_at) return { ok: true }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { pending: true }
}

export function EbookResourceUploadPage() {
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [lectureId, setLectureId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loadLectures, setLoadLectures] = useState<'idle' | 'loading' | 'err'>('idle')
  const [lecturesError, setLecturesError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [lastResourceId, setLastResourceId] = useState<string | null>(null)
  const [extractStatus, setExtractStatus] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadLectures('loading')
    void (async () => {
      const { data, error: qErr } = await supabase
        .from('lectures')
        .select('id, subject_id, instructor, title, series_description')
        .order('title')
      if (cancelled) return
      if (qErr) {
        setLoadLectures('err')
        setLecturesError(qErr.message)
        return
      }
      setLectures((data ?? []) as Lecture[])
      setLoadLectures('idle')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const lectureOptions = lectures.map((l) => ({
    value: l.id,
    label: `${l.instructor.trim() || '강사 미상'} · ${l.title}`,
  }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setSubmitError(null)
    setExtractStatus(null)
    if (!lectureId) {
      setSubmitError('강좌를 선택하세요.')
      return
    }
    if (!file || file.type !== 'application/pdf') {
      setSubmitError('PDF 파일을 선택하세요.')
      return
    }

    setSubmitting(true)
    try {
      const objectPath = `${lectureId}/${crypto.randomUUID()}_${safePdfFileName(file.name)}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, file, {
        contentType: 'application/pdf',
        upsert: false,
      })
      if (upErr) {
        setSubmitError(
          `${upErr.message} — Storage 버킷 "${BUCKET}" 이 없거나 업로드 권한이 없을 수 있습니다. Supabase 마이그레이션을 적용했는지 확인하세요.`,
        )
        return
      }

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath)
      const pdfUrl = pub.publicUrl
      const displayTitle =
        title.trim() ||
        file.name.replace(/\.pdf$/i, '').trim() ||
        '교재 PDF'

      const { data: ins, error: insErr } = await supabase
        .from('learning_resources')
        .insert({
          lecture_id: lectureId,
          resource_type: 'ebook',
          pdf_url: pdfUrl,
          title: displayTitle,
        })
        .select('id')
        .single()

      if (insErr || !ins?.id) {
        setSubmitError(insErr?.message ?? 'learning_resources 저장에 실패했습니다.')
        return
      }

      const rid = ins.id as string
      setLastResourceId(rid)
      setMessage(`교재가 등록되었습니다. 페이지 텍스트 추출이 백그라운드에서 진행됩니다. (id: ${rid})`)
      setFile(null)
      setTitle('')

      setExtractStatus('추출 결과 대기 중…')
      const polled = await pollExtractMeta(rid)
      if ('error' in polled) {
        setExtractStatus(`추출 실패: ${polled.error}`)
      } else if ('pending' in polled) {
        setExtractStatus(
          '아직 추출이 끝나지 않았거나 Vault/Edge 설정이 비어 있을 수 있습니다. ebook_extraction_runbook.sql 을 확인하세요.',
        )
      } else {
        setExtractStatus('추출 완료: ebook_pages 에 반영되었습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="eru-page">
      <Paper shadow="sm" p="lg" radius="md" className="eru-paper">
        <Stack gap="md">
          <div>
            <Title order={2}>교재 PDF 등록</Title>
            <Text size="sm" c="dimmed" mt={6}>
              업로드 후 <code>learning_resources</code> 가 생성되면 DB 트리거가 Edge Function을 호출해{' '}
              <code>ebook_pages</code> 를 채웁니다.
            </Text>
          </div>

          <Alert color="yellow" title="보안 참고">
            anon 키로 업로드할 수 있도록 Storage 정책이 열려 있습니다. 공개 배포 전 업로드 비활성화(
            <code>VITE_ENABLE_EBOOK_UPLOAD</code> 제거) 및 정책 강화를 권장합니다.
          </Alert>

          {loadLectures === 'err' && lecturesError && (
            <Alert color="red" title="강좌 목록을 불러오지 못했습니다">
              {lecturesError}
            </Alert>
          )}

          <form onSubmit={(e) => void handleSubmit(e)}>
            <Stack gap="md">
              <Select
                label="강좌"
                placeholder={loadLectures === 'loading' ? '불러오는 중…' : '강좌 선택'}
                data={lectureOptions}
                value={lectureId}
                onChange={setLectureId}
                searchable
                required
                disabled={loadLectures === 'loading'}
              />
              <TextInput
                label="교재 제목 (선택)"
                description="비우면 파일 이름을 사용합니다."
                value={title}
                onChange={(ev) => setTitle(ev.currentTarget.value)}
              />
              <FileInput
                label="PDF 파일"
                accept="application/pdf"
                value={file}
                onChange={setFile}
                required
              />
              <Button type="submit" loading={submitting}>
                업로드 및 등록
              </Button>
            </Stack>
          </form>

          {message && (
            <Alert color="teal" title="등록">
              {message}
            </Alert>
          )}
          {extractStatus && (
            <Alert color="blue" title="텍스트 추출">
              {extractStatus}
              {lastResourceId ? (
                <>
                  {' '}
                  <Text size="xs" mt="xs" c="dimmed">
                    리소스 ID: {lastResourceId}
                  </Text>
                </>
              ) : null}
            </Alert>
          )}
          {submitError && (
            <Alert color="red" title="오류">
              {submitError}
            </Alert>
          )}

          <Text size="sm">
            <Link to="/ebook">← 이북 메뉴로</Link>
          </Text>
        </Stack>
      </Paper>
    </div>
  )
}
