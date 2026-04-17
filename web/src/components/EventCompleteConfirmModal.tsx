import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import './ProfileModalShared.css'

type Props = {
  open: boolean
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}

export function EventCompleteConfirmModal({ open, busy, onClose, onConfirm }: Props) {
  useBodyScrollLock(open)

  if (!open) return null

  return (
    <div
      className="prm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ecm-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="prm-card" onClick={(e) => e.stopPropagation()}>
        <div className="prm-head">
          <h2 id="ecm-title">Завершить событие?</h2>
        </div>
        <div className="prm-body prm-scrollbar">
          <p className="prm-intro">
            После завершения событие получит статус «Завершено» — вернуть в активное состояние или перенести дату начала
            будет нельзя, останется только просмотр карточки и списка участников. Убедитесь, что встреча действительно не
            планируется или уже завершена.
          </p>
        </div>
        <div className="prm-foot">
          <div className="prm-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="button" className="btn event-complete-confirm-btn" disabled={busy} onClick={onConfirm}>
              {busy ? 'Отправка…' : 'Завершить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
