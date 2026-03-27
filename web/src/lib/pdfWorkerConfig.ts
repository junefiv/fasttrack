import { pdfjs } from 'react-pdf'

/**
 * 로컬 번들 worker와 react-pdf 내장 pdfjs API 버전이 어긋나는 문제를 피하기 위해,
 * npm과 동일한 패키지를 CDN에서 `pdfjs.version`에 맞춰 로드합니다.
 * (문서에서 흔히 쓰는 cdnjs `pdf.worker.min.js`는 pdf.js 5.x는 `.mjs` worker를 쓰므로 jsdelivr/npm 미러가 안전합니다.)
 */
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
