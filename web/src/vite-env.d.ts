/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_GEMINI_API_KEY: string
  readonly VITE_GEMINI_MODEL?: string
  /** 교재 RAG용 Gemini 임베딩 모델 (기본 gemini-embedding-001, 예: text-embedding-004) */
  readonly VITE_GEMINI_EMBEDDING_MODEL?: string
  /** true 일 때만 /ebook/upload 교재 업로드 페이지·사이드바 링크 노출 */
  readonly VITE_ENABLE_EBOOK_UPLOAD?: string
  /** 모의고사·드릴 프로토타입용 고정 사용자 UUID (미설정 시 localStorage 자동 생성) */
  readonly VITE_FASTTRACK_DEV_USER_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
