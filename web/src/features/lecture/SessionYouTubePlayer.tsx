import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { loadYouTubeIframeApi } from '../../lib/youtubeIframeApi'
import type { YTPlayerInstance } from '../../types/youtube'
import './SessionYouTubePlayer.css'

export type SessionPlayerHandle = {
  pause: () => void
  play: () => void
  togglePlay: () => void
  seekTo: (sec: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  getIsPlaying: () => boolean
}

type Props = {
  videoId: string
  className?: string
  onPlayerStateChange?: () => void
}

export const SessionYouTubePlayer = forwardRef<SessionPlayerHandle, Props>(
  function SessionYouTubePlayer({ videoId, className, onPlayerStateChange }, ref) {
    const uid = useId().replace(/:/g, '')
    const hostId = useMemo(() => `yt-host-${uid}`, [uid])
    const playerRef = useRef<YTPlayerInstance | null>(null)
    const [ready, setReady] = useState(false)

    useImperativeHandle(ref, () => ({
      pause: () => {
        playerRef.current?.pauseVideo()
      },
      play: () => {
        playerRef.current?.playVideo()
      },
      togglePlay: () => {
        const p = playerRef.current
        const Y = window.YT
        if (!p || !Y) return
        if (p.getPlayerState() === Y.PlayerState.PLAYING) p.pauseVideo()
        else p.playVideo()
      },
      seekTo: (sec) => {
        playerRef.current?.seekTo(sec, true)
      },
      getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
      getDuration: () => playerRef.current?.getDuration() ?? 0,
      getIsPlaying: () => {
        const p = playerRef.current
        const Y = window.YT
        if (!p || !Y) return false
        return p.getPlayerState() === Y.PlayerState.PLAYING
      },
    }), [])

    const onStateRef = useRef(onPlayerStateChange)
    onStateRef.current = onPlayerStateChange

    useEffect(() => {
      let cancelled = false
      const ytHolder: { current: YTPlayerInstance | null } = { current: null }

      void loadYouTubeIframeApi().then(() => {
        if (cancelled || !window.YT) return

        ytHolder.current = new window.YT.Player(hostId, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return
              playerRef.current = e.target
              setReady(true)
            },
            onStateChange: () => {
              onStateRef.current?.()
            },
          },
        })
      })

      return () => {
        cancelled = true
        setReady(false)
        playerRef.current = null
        try {
          ytHolder.current?.destroy()
        } catch {
          /* noop */
        }
      }
    }, [hostId, videoId])

    return (
      <div className={`session-yt ${className ?? ''}`} data-ready={ready}>
        <div className="session-yt__ratio">
          <div id={hostId} className="session-yt__frame" />
        </div>
      </div>
    )
  },
)
