import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  chatAvatarSrc,
  chatInboxWebSocketUrl,
  fetchMyChats,
  getToken,
  userFacingRequestError,
  type ChatListRow,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import './ChatPages.css'

type Tab = 'all' | 'event' | 'dm'

function previewLine(row: ChatListRow, myId: number | null): string {
  const raw = row.last_preview?.trim()
  if (!raw) return row.subtitle?.trim().slice(0, 72) || ''
  const sid = row.last_sender_profile_id
  if (myId != null && sid === myId) {
    const t = raw.length > 56 ? `${raw.slice(0, 56)}…` : raw
    return `Вы: ${t}`
  }
  return raw.length > 72 ? `${raw.slice(0, 72)}…` : raw
}

export function ChatsListPage() {
  const { token } = useAuth()
  const { profile } = useProfile()
  const myId = profile?.id ?? null
  const [tab, setTab] = useState<Tab>('all')
  const [rows, setRows] = useState<ChatListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!getToken()) {
      setRows([])
      return
    }
    setErr(null)
    setLoading(true)
    try {
      setRows(await fetchMyChats())
    } catch (e) {
      setErr(userFacingRequestError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!token) return
    const t = window.setInterval(() => void load(), 10000)
    return () => window.clearInterval(t)
  }, [token, load])

  useEffect(() => {
    if (!token) return
    const access = getToken()
    if (!access) return
    const ws = new WebSocket(chatInboxWebSocketUrl(access))
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as { type?: string }
        if (data.type === 'inbox_message') void load()
      } catch {
        /* ignore */
      }
    }
    return () => ws.close()
  }, [token, load])

  const filtered = useMemo(() => {
    if (tab === 'all') return rows
    if (tab === 'event') return rows.filter((r) => r.kind === 'event')
    return rows.filter((r) => r.kind === 'dm')
  }, [rows, tab])

  return (
    <div className="card wide chat-page">
      <div className="chat-page-head">
        <h1 className="chat-page-title">Чаты</h1>
      </div>
      <div className="chat-tabs" role="tablist" aria-label="Категории чатов">
        <button type="button" className={tab === 'all' ? 'chat-tab active' : 'chat-tab'} onClick={() => setTab('all')}>
          Все
        </button>
        <button
          type="button"
          className={tab === 'event' ? 'chat-tab active' : 'chat-tab'}
          onClick={() => setTab('event')}
        >
          Чаты событий
        </button>
        <button type="button" className={tab === 'dm' ? 'chat-tab active' : 'chat-tab'} onClick={() => setTab('dm')}>
          Личные
        </button>
      </div>
      {err ? <p className="error">{err}</p> : null}
      {loading ? <p className="muted">Загрузка…</p> : null}
      {!loading && !filtered.length ? <p className="muted">Пока нет чатов</p> : null}
      {!loading && filtered.length > 0 ? (
        <ul className="chat-list">
          {filtered.map((c) => {
            const unread = Math.max(0, Number(c.unread_count ?? 0))
            const line = previewLine(c, myId)
            return (
              <li key={c.id}>
                <Link to={`/chats/${c.id}`} className="chat-list-row">
                  <img className="chat-list-avatar" src={chatAvatarSrc(c)} width={48} height={48} alt="" />
                  <div className="chat-list-main">
                    <div className="chat-list-top">
                      <span className="chat-list-title">{c.title?.trim() || `Чат #${c.id}`}</span>
                      {c.read_only ? <span className="chat-list-badge">история</span> : null}
                      {unread > 0 ? <span className="chat-list-unread">{unread > 99 ? '99+' : unread}</span> : null}
                    </div>
                    {line ? <p className="chat-list-preview">{line}</p> : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
