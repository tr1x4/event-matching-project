import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import './ProfileModalShared.css'

type Props = {
  open: boolean
  busy?: boolean
  title: string
  children: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmModal({
  open,
  busy = false,
  title,
  children,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger,
  onClose,
  onConfirm,
}: Props) {
  useBodyScrollLock(open)

  if (!open) return null

  return (
    <div
      className="prm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget && !busy) onClose()
      }}
    >
      <div className="prm-card" onClick={(e) => e.stopPropagation()}>
        <div className="prm-head">
          <h2 id="confirm-modal-title">{title}</h2>
        </div>
        <div className="prm-body prm-scrollbar">
          <div className="prm-intro">{children}</div>
        </div>
        <div className="prm-foot">
          <div className="prm-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={danger ? 'btn event-complete-confirm-btn' : 'btn primary'}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? 'Подождите' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
