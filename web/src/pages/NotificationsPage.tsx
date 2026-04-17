import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useNotifications } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import './FormPage.css'
import './ProfilePage.css'
import './ChatPages.css'

type Tab = 'all' | 'event' | 'dm'

export function NotificationsPage() {
  const { token } = useAuth()
  const { loading: profLoading, mustFinishProfile } = useProfile()
  const navigate = useNavigate()
  const { items, clearAll, remove } = useNotifications()
  const [tab, setTab] = useState<Tab>('all')

  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (!profLoading && mustFinishProfile) navigate('/', { replace: true })
  }, [profLoading, mustFinishProfile, navigate])

  const filtered = useMemo(() => {
    if (tab === 'all') return items
    if (tab === 'event') return items.filter((x) => x.chat_kind === 'event')
    return items.filter((x) => x.chat_kind === 'dm')
  }, [items, tab])

  if (!token) return null

  return (
    <div className="card wide profile-edit">
      <div className="page-hero-inline">
        <h1>Уведомления</h1>
        {items.length ? (
          <button type="button" className="btn ghost small" onClick={() => clearAll()}>
            Очистить список
          </button>
        ) : null}
      </div>

      <div className="chat-tabs" role="tablist" aria-label="Тип уведомлений">
        <button type="button" className={tab === 'all' ? 'chat-tab active' : 'chat-tab'} onClick={() => setTab('all')}>
          Все
        </button>
        <button type="button" className={tab === 'event' ? 'chat-tab active' : 'chat-tab'} onClick={() => setTab('event')}>
          События
        </button>
        <button type="button" className={tab === 'dm' ? 'chat-tab active' : 'chat-tab'} onClick={() => setTab('dm')}>
          Личные
        </button>
      </div>

      {!filtered.length ? (
        <p className="muted" style={{ marginTop: '1rem' }}>
          Пока нет уведомлений.
        </p>
      ) : (
        <ul className="notif-list">
          {filtered.map((n) => (
            <li key={n.id} className="notif-row">
              <Link to={`/chats/${n.chat_id}`} className="notif-link" onClick={() => remove(n.id)}>
                <span className="notif-preview">{n.preview}</span>
                <span className="muted notif-meta">
                  Чат #{n.chat_id}
                  {n.chat_kind === 'event' ? ' · событие' : n.chat_kind === 'dm' ? ' · личный' : ''}
                </span>
              </Link>
              <button type="button" className="btn ghost small" aria-label="Убрать" onClick={() => remove(n.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
