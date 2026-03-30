/**
 * Reads ahn_session_1_captions_raw.txt → SQL for lecture_captions
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const raw = readFileSync(join(__dirname, 'ahn_session_1_captions_raw.txt'), 'utf8')

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

const SESSION_ID = 'a3333333-3333-4333-8333-333333333303'
const rows = segments.map((s, idx) => {
  const end =
    idx + 1 < segments.length ? segments[idx + 1].start : Math.max(s.start + 4, s.start + 1)
  return { start: s.start, end, text: s.text }
})

const esc = (t) => t.replace(/'/g, "''")
const parts = [
  `-- 1강 안중근 — lecture_captions (session ${SESSION_ID})`,
  `DELETE FROM public.lecture_captions WHERE lecture_session_id = '${SESSION_ID}'::uuid;`,
  '',
  'INSERT INTO public.lecture_captions (lecture_session_id, start_sec, end_sec, text, language) VALUES',
  rows
    .map(
      (r, i) =>
        `  ('${SESSION_ID}'::uuid, ${r.start}, ${r.end}, '${esc(r.text)}', 'ko')${i < rows.length - 1 ? ',' : ';'}`,
    )
    .join('\n'),
  '',
  `-- lecture_captions 트리거가 caption 플래그 동기화; 없으면 수동 실행`,
  `UPDATE public.lecture_sessions SET caption = true WHERE id = '${SESSION_ID}'::uuid;`,
  '',
]
const out = join(__dirname, 'insert_ahn_lecture_captions.sql')
writeFileSync(out, parts.join('\n'), 'utf8')
console.error(`Wrote ${rows.length} rows → ${out}`)
