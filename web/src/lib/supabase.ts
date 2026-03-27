import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn(
    '[FASTTRACK] VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 비어 있습니다. web/.env.local 을 확인하세요.',
  )
}

export const supabase = createClient(url ?? '', key ?? '')
