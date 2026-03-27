export {}

type YTPlayerInstance = {
  destroy(): void
  pauseVideo(): void
  playVideo(): void
  seekTo(seconds: number, allowSeekAhead?: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        id: string,
        opts: {
          videoId: string
          width?: string | number
          height?: string | number
          playerVars?: Record<string, string | number>
          events?: {
            onReady?: (e: { target: YTPlayerInstance }) => void
            onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void
          }
        },
      ) => YTPlayerInstance
      PlayerState: {
        ENDED: number
        PLAYING: number
        PAUSED: number
        BUFFERING: number
        CUED: number
      }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

export type { YTPlayerInstance }
