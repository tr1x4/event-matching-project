import { PauseIcon, PlayIcon } from '@heroicons/react/24/solid'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { chatAssetAbsUrl } from '../api/client'
import { formatVoiceClock } from '../utils/chatUi'

type Props = {
  src: string
  /** Подпись над дорожкой (например имя файла для вложения). */
  caption?: string
}

export function ChatVoicePlayer({ src, caption }: Props) {
  const url = useMemo(() => {
    const p = src.trim()
    if (p.startsWith('blob:') || p.startsWith('http://') || p.startsWith('https://')) return p
    return chatAssetAbsUrl(src)
  }, [src])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [dur, setDur] = useState(0)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const progress = dur > 0 ? Math.min(1, cur / dur) : 0

  const seekTo = useCallback((v: number) => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = v
    setCur(v)
  }, [])

  const toggle = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      void a.play().catch(() => setPlaying(false))
    } else {
      a.pause()
      setPlaying(false)
    }
  }, [])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    setCur(0)
    setDur(0)
    setPlaying(false)
    a.load()
  }, [url])

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      const a = audioRef.current
      if (!el || !a || !dur) return
      const rect = el.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      seekTo(ratio * dur)
    },
    [dur, seekTo],
  )

  const onTrackPointerDown = (e: { clientX: number; pointerId: number; target: EventTarget | null }) => {
    if (!dur) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    seekFromClientX(e.clientX)
    const move = (ev: PointerEvent) => seekFromClientX(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div className="chat-voice-card">
      {caption ? <div className="chat-voice-caption muted">{caption}</div> : null}
      <div className="chat-voice-card-inner">
        <button
          type="button"
          className="chat-voice-playbtn"
          onClick={() => void toggle()}
          aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        >
          {playing ? <PauseIcon width={20} height={20} /> : <PlayIcon width={20} height={20} />}
        </button>
        <div className="chat-voice-main">
          <div
            ref={trackRef}
            className="chat-voice-track"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={dur > 0 ? dur : 0}
            aria-valuenow={dur > 0 ? Math.min(cur, dur) : 0}
            aria-label="Позиция воспроизведения"
            onPointerDown={onTrackPointerDown}
          >
            <div className="chat-voice-track-fill" style={{ width: `${progress * 100}%` }} />
            <div className="chat-voice-track-knob" style={{ left: `${progress * 100}%` }} />
          </div>
          <div className="chat-voice-times muted">
            <span>{formatVoiceClock(cur)}</span>
            <span className="chat-voice-times-sep">/</span>
            <span>{formatVoiceClock(dur)}</span>
          </div>
        </div>
      </div>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={() => {
          const a = audioRef.current
          if (a && Number.isFinite(a.duration)) setDur(a.duration)
        }}
        onTimeUpdate={() => {
          const a = audioRef.current
          if (a) setCur(a.currentTime)
        }}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
    </div>
  )
}
