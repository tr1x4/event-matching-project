import { useEffect, useMemo, useState } from 'react'
import { unblockEventParticipant, profileAvatarSrc, fetchProfilePublic, type Profile } from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import './ProfileModalShared.css'

type Props = {
  open: boolean
  eventId: number
  blockedIds: number[]
  busy: boolean
  onClose: () => void
  onUnblocked: () => Promise<void>
}

export function EventBlockedListModal({ open, eventId, blockedIds, busy, onClose, onUnblocked }: Props) {
  useBodyScrollLock(open)
  const [rows, setRows] = useState<{ id: number; profile: Profile | null }[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [localBusy, setLocalBusy] = useState(false)
  const blockedKey = useMemo(() => [...blockedIds].sort((a, b) => a - b).join(','), [blockedIds])

  useEffect(() => {
    if (!open) return
    let c = false
    setLoadErr(null)
    ;(async () => {
      const ids = blockedKey ? blockedKey.split(',').map((x) => Number(x)) : []
      const list: { id: number; profile: Profile | null }[] = []
      for (const id of ids) {
        try {
          const p = await fetchProfilePublic(id)
          if (!c) list.push({ id, profile: p })
        } catch {
          if (!c) list.push({ id, profile: null })
        }
      }
      if (!c) setRows(list)
    })()
    return () => {
      c = true
    }
  }, [open, blockedKey])

  if (!open) return null

  async function unblock(pid: number) {
    setLocalBusy(true)
    try {
      await unblockEventParticipant(eventId, pid)
      await onUnblocked()
    } finally {
      setLocalBusy(false)
    }
  }

  return (
    <div
      className="prm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ebm-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="prm-card prm-card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="prm-head">
          <h2 id="ebm-title">Исключённые участники</h2>
          <p className="prm-intro">
            Эти пользователи не могут снова присоединиться к событию, пока вы не снимете ограничение.
          </p>
        </div>
        <div className="prm-body prm-scrollbar">
          {loadErr ? <p className="error">{loadErr}</p> : null}
          {blockedIds.length === 0 ? (
            <p className="muted">Список пуст.</p>
          ) : (
            <ul className="event-blocked-list">
              {rows.map(({ id, profile }) => (
                <li key={id} className="event-blocked-row">
                  <img className="event-blocked-avatar" src={profileAvatarSrc(profile)} width={40} height={40} alt="" />
                  <span className="event-blocked-name">{profile?.name?.trim() || `Профиль #${id}`}</span>
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={busy || localBusy}
                    onClick={() => void unblock(id)}
                  >
                    Пригласить обратно
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="prm-foot">
          <div className="prm-actions">
            <button type="button" className="btn primary" onClick={onClose} disabled={busy || localBusy}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
