import { type FormEvent, useEffect, useState } from 'react'
import { changePassword, userFacingRequestError } from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import '../pages/FormPage.css'
import './ProfileModalShared.css'

type Props = {
  open: boolean
  onClose: () => void
}

export function PasswordChangeModal({ open, onClose }: Props) {
  useBodyScrollLock(open)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setCurrent('')
      setNext('')
      setConfirm('')
      setError(null)
      setOk(null)
    }
  }, [open])

  if (!open) return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (next.length < 8) {
      setError('Новый пароль должен содержать не менее 8 символов.')
      return
    }
    if (next !== confirm) {
      setError('Новый пароль и подтверждение должны совпадать.')
      return
    }
    setBusy(true)
    try {
      await changePassword(current, next)
      setOk('Пароль успешно обновлён.')
      setCurrent('')
      setNext('')
      setConfirm('')
      window.setTimeout(() => {
        onClose()
      }, 1200)
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
      aria-labelledby="pcm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form className="prm-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="prm-head">
          <h2 id="pcm-title">Смена пароля</h2>
          <p className="prm-intro">Текущий пароль и новый (не короче 8 символов).</p>
        </div>
        <div className="prm-body prm-scrollbar">
          <div className="wizard-field">
            <label className="field-label" htmlFor="pcm-cur">
              Текущий пароль
            </label>
            <input
              id="pcm-cur"
              className="field-input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="wizard-field">
            <label className="field-label" htmlFor="pcm-new">
              Новый пароль
            </label>
            <input
              id="pcm-new"
              className="field-input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="wizard-field">
            <label className="field-label" htmlFor="pcm-conf">
              Подтверждение нового пароля
            </label>
            <input
              id="pcm-conf"
              className="field-input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          {ok ? <p className="profile-success-msg">{ok}</p> : null}
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
