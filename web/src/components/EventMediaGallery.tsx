import { TrashIcon } from '@heroicons/react/24/outline'
import type { MouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { eventMediaAbsUrl, type EventMediaItem } from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import './EventMediaGallery.css'
import './ProfileModalShared.css'

function sortVideoFirst(items: EventMediaItem[]): EventMediaItem[] {
  const v = items.filter((x) => x.kind === 'video')
  const o = items.filter((x) => x.kind !== 'video')
  return [...v, ...o]
}

export type EventMediaGalleryProps = {
  items: EventMediaItem[]
  /** Для событий: видео слева; для профиля: порядок как сохранено (новые первые). */
  videoFirst?: boolean
  resolveMediaUrl?: (path: string) => string
  onDeleteItem?: (id: string) => void | Promise<void>
}

export function EventMediaGallery({
  items,
  videoFirst = true,
  resolveMediaUrl = eventMediaAbsUrl,
  onDeleteItem,
}: EventMediaGalleryProps) {
  const sorted = useMemo(
    () => (videoFirst ? sortVideoFirst(items) : items),
    [items, videoFirst],
  )
  const stripRef = useRef<HTMLDivElement>(null)
  const [modalIdx, setModalIdx] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  useBodyScrollLock(modalIdx !== null)

  const scrollStrip = useCallback((dir: -1 | 1) => {
    const el = stripRef.current
    if (!el) return
    const step = Math.max(120, el.clientWidth * 0.75)
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    setModalIdx((i) => {
      if (i === null) return null
      if (!sorted.length) return null
      return Math.min(i, sorted.length - 1)
    })
  }, [sorted.length, sorted])

  useEffect(() => {
    if (modalIdx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalIdx(null)
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setModalIdx((i) => (i === null ? null : (i + sorted.length - 1) % sorted.length))
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setModalIdx((i) => (i === null ? null : (i + 1) % sorted.length))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalIdx, sorted.length])

  useEffect(() => {
    if (modalIdx === null) return
    const cur = sorted[modalIdx]
    if (cur?.kind !== 'video') return
    const id = requestAnimationFrame(() => {
      const v = videoRef.current
      if (!v) return
      v.muted = false
      void v.play().catch(() => {
        /* автовоспроизведение со звуком может быть заблокировано */
      })
    })
    return () => cancelAnimationFrame(id)
  }, [modalIdx, sorted])

  if (!sorted.length) return null

  const curModal = modalIdx !== null ? sorted[modalIdx] : null
  const canDeleteModal = Boolean(onDeleteItem && curModal?.id)

  const runDelete = async (id: string) => {
    if (!onDeleteItem || deleting) return
    setDeleting(true)
    try {
      await onDeleteItem(id)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="event-media-gallery">
      <div className="event-media-strip-wrap">
        <button
          type="button"
          className="event-media-nav"
          aria-label="Прокрутить влево"
          onClick={() => scrollStrip(-1)}
        >
          ‹
        </button>
        <div ref={stripRef} className="event-media-strip" role="list">
          {sorted.map((m, i) => {
            const src = resolveMediaUrl(m.url)
            const open = () => setModalIdx(i)
            const del =
              onDeleteItem && m.id
                ? async (e: MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation()
                    await runDelete(m.id as string)
                  }
                : undefined
            if (m.kind === 'video') {
              return (
                <div key={`${m.id ?? ''}-${m.url}-${i}`} className="event-media-slide" role="listitem">
                  {del ? (
                    <button
                      type="button"
                      className="event-media-slide-del"
                      aria-label="Удалить видео"
                      disabled={deleting}
                      onClick={del}
                    >
                      <TrashIcon width={18} height={18} />
                    </button>
                  ) : null}
                  <video
                    src={src}
                    muted
                    playsInline
                    autoPlay
                    loop
                    onClick={open}
                    aria-label="Видео, открыть на весь экран"
                  />
                </div>
              )
            }
            return (
              <div key={`${m.id ?? ''}-${m.url}-${i}`} className="event-media-slide" role="listitem">
                {del ? (
                  <button
                    type="button"
                    className="event-media-slide-del"
                    aria-label="Удалить фото"
                    disabled={deleting}
                    onClick={del}
                  >
                    <TrashIcon width={18} height={18} />
                  </button>
                ) : null}
                <img src={src} alt="" loading="lazy" onClick={open} />
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="event-media-nav"
          aria-label="Прокрутить вправо"
          onClick={() => scrollStrip(1)}
        >
          ›
        </button>
      </div>

      {modalIdx !== null ? (
        <div
          className="event-media-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр медиа"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalIdx(null)
          }}
        >
          <div className="event-media-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="event-media-modal-close" onClick={() => setModalIdx(null)}>
              ×
            </button>
            <div className="event-media-modal-stage prm-scrollbar">
              {sorted[modalIdx]?.kind === 'video' ? (
                <video
                  key={sorted[modalIdx]!.url}
                  ref={videoRef}
                  src={resolveMediaUrl(sorted[modalIdx]!.url)}
                  controls
                  playsInline
                  autoPlay
                />
              ) : (
                <img src={resolveMediaUrl(sorted[modalIdx]!.url)} alt="" />
              )}
            </div>
            <div className="event-media-modal-bar">
              <button
                type="button"
                className="event-media-nav"
                onClick={() => setModalIdx((i) => (i! + sorted.length - 1) % sorted.length)}
              >
                ‹
              </button>
              <p className="event-media-modal-caption">
                {modalIdx + 1} / {sorted.length}
                {sorted[modalIdx]?.kind === 'video' ? ' · видео' : ' · фото'}
              </p>
              <button type="button" className="event-media-nav" onClick={() => setModalIdx((i) => (i! + 1) % sorted.length)}>
                ›
              </button>
            </div>
            {canDeleteModal && curModal?.id ? (
              <div className="event-media-modal-delete-row">
                <button
                  type="button"
                  className="btn ghost event-media-modal-delete-btn"
                  disabled={deleting}
                  onClick={() => void runDelete(curModal.id!)}
                >
                  Удалить этот файл
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
