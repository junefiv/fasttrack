/**
 * Reads march_math_prob_stats_captions_raw.txt → seed_march_math_prob_stats.sql
 * 수학(3월 학평) 전용 id: d1111111 / d2222222 / d3333333 (안중근 a… 와 분리)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(join(__dirname, 'march_math_prob_stats_captions_raw.txt'), 'utf8')

function parseTs(line) {
  const m = line.trim().match(/^(\d+):(\d{2})$/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

const lines = raw.split(/\r?\n/)
const segments = []
let i = 0
while (i < lines.length) {
  const sec = parseTs(lines[i])
  if (sec === null) {
    i++
    continue
  }
  i++
  const textParts = []
  while (i < lines.length && parseTs(lines[i]) === null) {
    const t = lines[i].trim()
    if (t) textParts.push(t)
    i++
  }
  const text = textParts.join(' ').replace(/\s+/g, ' ').trim()
  if (text) segments.push({ start: sec, text })
}

const SUBJECT_ID = 'd1111111-1111-4111-8111-111111111101'
const LECTURE_ID = 'd2222222-2222-4222-8222-222222222202'
const SESSION_ID = 'd3333333-3333-4333-8333-333333333303'
const VIDEO_END_SEC = 25 * 60
const rows = segments.map((s, idx) => {
  const end = idx + 1 < segments.length ? segments[idx + 1].start : VIDEO_END_SEC
  return { start: s.start, end: Math.max(end, s.start + 1), text: s.text }
})

const esc = (t) => t.replace(/'/g, "''")

const header = `BEGIN;

INSERT INTO public.subjects (id, name, category)
VALUES (
  '${SUBJECT_ID}'::uuid,
  '수학',
  '수학'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category;

INSERT INTO public.lectures (id, subject_id, instructor, title, series_description)
VALUES (
  '${LECTURE_ID}'::uuid,
  '${SUBJECT_ID}'::uuid,
  '이미지 강사',
  '3월 학평 문제풀이 강의',
  '3월 학편 문풀강의'
)
ON CONFLICT (id) DO UPDATE SET
  subject_id = EXCLUDED.subject_id,
  instructor = EXCLUDED.instructor,
  title = EXCLUDED.title,
  series_description = EXCLUDED.series_description;

INSERT INTO public.lecture_sessions (
  id, lecture_id, session_order, title,
  youtube_video_id, youtube_url, total_duration_sec, thumbnail_url, caption
)
VALUES (
  '${SESSION_ID}'::uuid,
  '${LECTURE_ID}'::uuid,
  1,
  '3월 학평 확률과통계 문풀',
  'fHLkwvsBr1M',
  'https://www.youtube.com/watch?v=fHLkwvsBr1M',
  ${VIDEO_END_SEC},
  NULL,
  false
)
ON CONFLICT (id) DO UPDATE SET
  lecture_id = EXCLUDED.lecture_id,
  session_order = EXCLUDED.session_order,
  title = EXCLUDED.title,
  youtube_video_id = EXCLUDED.youtube_video_id,
  youtube_url = EXCLUDED.youtube_url,
  total_duration_sec = EXCLUDED.total_duration_sec,
  thumbnail_url = EXCLUDED.thumbnail_url;

DELETE FROM public.lecture_captions WHERE lecture_session_id = '${SESSION_ID}'::uuid;

`

const insertBlock = [
  'INSERT INTO public.lecture_captions (lecture_session_id, start_sec, end_sec, text, language) VALUES',
  rows
    .map(
      (r, j) =>
        `  ('${SESSION_ID}'::uuid, ${r.start}, ${r.end}, '${esc(r.text)}', 'ko')${j < rows.length - 1 ? ',' : ';'}`,
    )
    .join('\n'),
  '',
  'COMMIT;',
  '',
].join('\n')

const outPath = join(__dirname, 'seed_march_math_prob_stats.sql')
writeFileSync(outPath, header + insertBlock, 'utf8')
console.error(`Wrote ${rows.length} caption rows → ${outPath}`)
