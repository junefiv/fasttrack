/**
 * lee_march_english_captions_raw.txt → insert_lee_march_english_captions.sql
 * 회차 id: e3333333-3333-4333-8333-333333333303
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(join(__dirname, 'lee_march_english_captions_raw.txt'), 'utf8')

/** @returns {number | null} */
function parseTs(line) {
  const s = line.trim()
  const hms = s.match(/^(\d+):(\d{2}):(\d{2})$/)
  if (hms) {
    return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
  }
  const ms = s.match(/^(\d+):(\d{2})$/)
  if (ms) {
    return Number(ms[1]) * 60 + Number(ms[2])
  }
  return null
}

const lines = raw.split(/\r?\n/)
const segments = []
let i = 0

while (i < lines.length) {
  let line = lines[i]
  let sec = parseTs(line)
  if (sec === null && line.includes('이 강좌의 캡션은')) {
    const m = line.match(/(\d+):(\d{2})(?::(\d{2}))?$/)
    if (m) {
      sec = m[3] != null
        ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
        : Number(m[1]) * 60 + Number(m[2])
    }
  }
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
  let text = textParts.join(' ').replace(/\s+/g, ' ').trim()
  text = text.replace(/<\/user_query>\s*$/i, '').trim()
  if (text) segments.push({ start: sec, text })
}

if (segments.length < 2) {
  console.error('Too few segments:', segments.length)
  process.exit(1)
}

for (let k = 1; k < segments.length; k++) {
  if (segments[k].start < segments[k - 1].start) {
    console.error('Non-monotonic at', k, segments[k - 1], segments[k])
    process.exit(1)
  }
}

const SESSION_ID = 'e3333333-3333-4333-8333-333333333303'
const lastStart = segments[segments.length - 1].start
const VIDEO_END_SEC = lastStart + 45

const rows = segments.map((s, idx) => {
  const end = idx + 1 < segments.length ? segments[idx + 1].start : VIDEO_END_SEC
  return { start: s.start, end: Math.max(end, s.start + 1), text: s.text }
})

const esc = (t) => t.replace(/'/g, "''")

const header = `BEGIN;

DELETE FROM public.lecture_captions WHERE lecture_session_id = '${SESSION_ID}'::uuid;

INSERT INTO public.lecture_captions (lecture_session_id, start_sec, end_sec, text, language) VALUES
`

const insertBlock =
  rows
    .map(
      (r, j) =>
        `  ('${SESSION_ID}'::uuid, ${r.start}, ${r.end}, '${esc(r.text)}', 'ko')${j < rows.length - 1 ? ',' : ';'}`,
    )
    .join('\n') +
  `

UPDATE public.lecture_sessions
SET total_duration_sec = ${VIDEO_END_SEC}, caption = true
WHERE id = '${SESSION_ID}'::uuid;

COMMIT;
`

const outPath = join(__dirname, 'insert_lee_march_english_captions.sql')
writeFileSync(outPath, header + insertBlock, 'utf8')
console.error(`Wrote ${rows.length} caption rows → ${outPath}, video end ${VIDEO_END_SEC}s`)
