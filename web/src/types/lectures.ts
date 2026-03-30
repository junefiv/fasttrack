export type Subject = {
  id: string
  name: string
  category: string | null
}

export type Lecture = {
  id: string
  subject_id: string
  instructor: string
  title: string
  series_description: string | null
}

export type LectureSession = {
  id: string
  lecture_id: string
  session_order: number
  title: string
  youtube_video_id: string
  youtube_url: string | null
  total_duration_sec: number | null
  thumbnail_url: string | null
  /** lecture_captions 가 1건 이상이면 true (DB 트리거로 동기화) */
  caption: boolean
}

export type LectureCaption = {
  id: string
  lecture_session_id: string
  start_sec: number
  end_sec: number
  text: string
  language: string | null
}

/** `learning_resources` — `lectures.id` 만 FK */
export type LearningResource = {
  id: string
  pdf_url: string
  lecture_id: string
  title?: string | null
  /** Edge Function 텍스트 추출 성공 시각 */
  ebook_text_extracted_at?: string | null
  /** 추출 실패 시 메시지 */
  ebook_text_extract_error?: string | null
}

/** `ebook_pages` — PDF 페이지별 추출 텍스트 */
export type EbookPage = {
  id: string
  learning_resource_id: string
  page_number: number
  body: string
  created_at?: string
}

/** `ebook_pages` → `fetchLectureEbookSections` 로 채워 질문 패널·Gemini 프롬프트에 주입 */
export type LectureEbookSection = {
  id: string
  title: string
  pageStart?: number
  pageEnd?: number
  body: string
}

export type SessionWithLecture = LectureSession & {
  lectures: {
    id: string
    title: string
    instructor: string
    subjects: Pick<Subject, 'id' | 'name' | 'category'> | null
  } | null
}
