import { type ChangeEvent, useEffect, useState } from 'react'
import { uploadProfileGallery, userFacingRequestError, type Profile } from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useLocalFileMediaItems } from '../hooks/useLocalFileMediaItems'
import { MAX_MEDIA_UPLOAD_BATCH, mergeProfileGalleryPending } from '../utils/mediaFile'
import '../pages/FormPage.css'
import './EventMediaGallery.css'
import './ProfileModalShared.css'
import './MediaPickModal.css'
import { EventMediaGallery } from './EventMediaGallery'

type Props = {
  open: boolean
  onClose: () => void
  profile: Profile | null
  refreshProfile: () => Promise<void>
}

export function ProfileGalleryMediaModal({ open, onClose, profile, refreshProfile }: Props) {
  useBodyScrollLock(open)
  const [pending, setPending] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existing = profile?.gallery ?? []
  const { items: pendingItems, filterOutMediaId } = useLocalFileMediaItems(pending)

  useEffect(() => {
    if (!open) {
      setPending([])
      setError(null)
      setBusy(false)
    }
  }, [open])

  if (!open || !profile) return null

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!list.length) return
    setError(null)
    const merged = mergeProfileGalleryPending(existing, pending, list)
    if (!merged.ok) {
      setError(merged.error)
      return
    }
    setPending(merged.next)
  }

  async function onSave() {
    if (!pending.length) return
    setError(null)
    setBusy(true)
    try {
      for (const f of pending) {
        await uploadProfileGallery(f)
      }
      await refreshProfile()
      setPending([])
      onClose()
    } catch (err) {
      setError(userFacingRequestError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="prm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prm-gallery-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget && !busy) onClose()
      }}
    >
      <div className="prm-card prm-card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="prm-head">
          <h2 id="prm-gallery-title">Медиа в ленту профиля</h2>
          <p className="prm-intro">
            За один выбор не более {MAX_MEDIA_UPLOAD_BATCH} файлов; каждый файл до 50 МБ. Общее число вложений в ленту не
            ограничено.
          </p>
        </div>
        <div className="prm-body prm-scrollbar">
          <label className="btn primary prm-file-btn">
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm"
              className="prm-file-inp"
              disabled={busy}
              onChange={onPick}
            />
            Добавить файлы
          </label>

          {pendingItems.length ? (
            <div className="mpm-strip-wrap">
              <EventMediaGallery
                items={pendingItems}
                resolveMediaUrl={(u) => u}
                onDeleteItem={
                  busy
                    ? undefined
                    : (id) => {
                        setPending(filterOutMediaId(id))
                        setError(null)
                      }
                }
              />
            </div>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
        </div>
        <div className="prm-foot">
          <div className="prm-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="button" className="btn primary" disabled={busy || !pending.length} onClick={() => void onSave()}>
              {busy ? 'Отправка…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
