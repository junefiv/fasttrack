import * as pdfjsLib from 'pdfjs-dist'
import { pdfjs } from 'react-pdf'
import './pdfWorkerConfig'

if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjs.GlobalWorkerOptions.workerSrc
}

/**
 * PDF URL에서 pdf.js로 전체 텍스트 추출 (RAG 청크용).
 * CORS·인증 URL은 브라우저에서 열리는 것과 동일해야 합니다.
 */
export async function extractPdfPlainText(url: string): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false })
  const pdf = await loadingTask.promise
  const parts: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    const line = tc.items
      .map((it) => {
        if (it && typeof it === 'object' && 'str' in it && typeof (it as { str: string }).str === 'string') {
          return (it as { str: string }).str
        }
        return ''
      })
      .join(' ')
    const trimmed = line.replace(/\s+/g, ' ').trim()
    if (trimmed) parts.push(trimmed)
  }
  return parts.join('\n\n')
}
