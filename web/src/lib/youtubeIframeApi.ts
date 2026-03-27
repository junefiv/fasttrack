let iframeApiPromise: Promise<void> | null = null

export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.YT?.Player) return Promise.resolve()

  if (!iframeApiPromise) {
    iframeApiPromise = new Promise((resolve) => {
      const done = () => resolve()

      const prev = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        prev?.()
        done()
      }

      const existing = document.querySelector<HTMLScriptElement>(
        'script[src*="youtube.com/iframe_api"]',
      )
      if (!existing) {
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        document.body.appendChild(tag)
      }

      const tick = window.setInterval(() => {
        if (window.YT?.Player) {
          window.clearInterval(tick)
          done()
        }
      }, 50)

      window.setTimeout(() => window.clearInterval(tick), 15_000)
    })
  }

  return iframeApiPromise
}
