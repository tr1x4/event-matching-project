import { type FormEvent, useEffect, useState } from 'react'
import { updateProfile, userFacingRequestError, type Profile } from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import '../pages/FormPage.css'
import './ProfileModalShared.css'

type Props = {
  open: boolean
  onClose: () => void
  profile: Profile | null
  refreshProfile: () => Promise<void>
}

const MAX = 4000

export function ProfileBioEditModal({ open, onClose, profile, refreshProfile }: Props) {
  useBodyScrollLock(open)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !profile) return
    setText(profile.bio ?? '')
    setError(null)
  }, [open, profile])

  if (!open || !profile) return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (text.length > MAX) {
      setError(`Не более ${MAX} символов.`)
      return
    }
    setBusy(true)
    try {
      await updateProfile({ bio: text.trim() || '' })
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
      aria-labelledby="prm-bio-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <form className="prm-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="prm-head">
          <h2 id="prm-bio-title">О себе</h2>
          <p className="prm-intro">Кратко о себе для других участников.</p>
        </div>
        <div className="prm-body prm-scrollbar">
          <div className="wizard-field">
            <label className="field-label" htmlFor="prm-bio-ta">
              Текст
            </label>
            <textarea
              id="prm-bio-ta"
              className="field-input"
              rows={6}
              value={text}
              maxLength={MAX}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="profile-field-hint">
              {text.length} / {MAX}
            </p>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>
        <div className="prm-foot">
          <div className="prm-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
