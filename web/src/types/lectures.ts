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
}

/** 추후 `lectures` ↔ 이북 본문(FK) 연동 시 LLM·드로어에 주입 */
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
