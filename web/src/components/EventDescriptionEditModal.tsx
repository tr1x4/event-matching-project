import { type FormEvent, useEffect, useState } from 'react'
import { patchEvent, userFacingRequestError } from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import '../pages/FormPage.css'
import './ProfileModalShared.css'

const MAX = 8000

type Props = {
  open: boolean
  eventId: number
  initialText: string
  onClose: () => void
  onSaved: () => Promise<void>
}

export function EventDescriptionEditModal({ open, eventId, initialText, onClose, onSaved }: Props) {
  useBodyScrollLock(open)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setText(initialText)
    setError(null)
  }, [open, initialText])

  if (!open) return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (text.length > MAX) {
      setError(`Не более ${MAX} символов.`)
      return
    }
    setBusy(true)
    try {
      await patchEvent(eventId, { description: text.trim() })
      await onSaved()
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
      aria-labelledby="edm-desc-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <form className="prm-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="prm-head">
          <h2 id="edm-desc-title">Описание события</h2>
        </div>
        <div className="prm-body prm-scrollbar">
          <div className="wizard-field">
            <label className="field-label" htmlFor="edm-desc-ta">
              Текст
            </label>
            <textarea
              id="edm-desc-ta"
              className="field-input"
              rows={7}
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
