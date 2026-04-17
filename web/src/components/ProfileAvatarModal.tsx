import { type ChangeEvent, useEffect, useState } from 'react'
import {
  deleteProfileAvatar,
  profileAvatarSrc,
  uploadProfileAvatar,
  userFacingRequestError,
  type Profile,
} from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import '../pages/FormPage.css'
import './ProfileModalShared.css'

type Props = {
  open: boolean
  onClose: () => void
  profile: Profile | null
  refreshProfile: () => Promise<void>
}

export function ProfileAvatarModal({ open, onClose, profile, refreshProfile }: Props) {
  useBodyScrollLock(open)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) setError(null)
  }, [open])

  if (!open || !profile) return null
  const p = profile

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(null)
    setBusy(true)
    try {
      await uploadProfileAvatar(f)
      await refreshProfile()
      onClose()
    } catch (err) {
      setError(userFacingRequestError(err))
    } finally {
      setBusy(false)
    }
  }

  async function onRemove() {
    if (!p.avatar_url) return
    setError(null)
    setBusy(true)
    try {
      await deleteProfileAvatar()
      await refreshProfile()
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
      aria-labelledby="prm-avatar-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="prm-card" onClick={(e) => e.stopPropagation()}>
        <div className="prm-head">
          <h2 id="prm-avatar-title">Фото профиля</h2>
          <p className="prm-intro">JPEG, PNG или WebP, до 50 МБ. Можно удалить текущее фото.</p>
        </div>
        <div className="prm-body prm-scrollbar">
          <div className="prm-avatar-wrap">
            <img className="prm-avatar-img" src={profileAvatarSrc(p)} width={120} height={120} alt="" />
          </div>
          <label className="btn primary prm-file-btn">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="prm-file-inp"
              disabled={busy}
              onChange={onFile}
            />
            {busy ? 'Загрузка…' : 'Выбрать другое фото'}
          </label>
          {p.avatar_url ? (
            <button type="button" className="btn ghost prm-remove" disabled={busy} onClick={() => void onRemove()}>
              Убрать фото
            </button>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
        <div className="prm-foot">
          <div className="prm-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
