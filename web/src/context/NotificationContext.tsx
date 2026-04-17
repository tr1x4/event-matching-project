import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { chatInboxWebSocketUrl, getToken, type ChatMessage } from '../api/client'
import { useAuth } from './AuthContext'

export type InboxNotificationItem = {
  id: string
  chat_id: number
  chat_kind: string
  preview: string
  sender_profile_id: number
  message: ChatMessage
  at: number
}

type NotificationState = {
  items: InboxNotificationItem[]
  clearAll: () => void
  remove: (id: string) => void
  toasts: { id: string; text: string; chatId: number }[]
  dismissToast: (id: string) => void
}

const NotificationContext = createContext<NotificationState | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const pathRef = useRef(location.pathname)
  const [items, setItems] = useState<InboxNotificationItem[]>([])
  const [toasts, setToasts] = useState<{ id: string; text: string; chatId: number }[]>([])
  const seq = useRef(0)

  useEffect(() => {
    pathRef.current = location.pathname
  }, [location.pathname])

  const pushToast = useCallback((text: string, chatId: number) => {
    const id = `t-${++seq.current}`
    setToasts((prev) => [...prev.slice(-4), { id, text, chatId }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }, 5200)
  }, [])

  useEffect(() => {
    if (!token) {
      setItems([])
      return
    }
    const access = getToken()
    if (!access) return
    const url = chatInboxWebSocketUrl(access)
    const ws = new WebSocket(url)
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as {
          type?: string
          chat_id?: number
          chat_kind?: string
          preview?: string
          sender_profile_id?: number
          message?: ChatMessage
        }
        if (data.type !== 'inbox_message' || !data.message || typeof data.chat_id !== 'number') return
        const path = pathRef.current
        const inSameChat = path === `/chats/${data.chat_id}` || path.startsWith(`/chats/${data.chat_id}/`)
        if (inSameChat) return
        const nid = `n-${data.message.id}-${Date.now()}`
        setItems((prev) => {
          const next: InboxNotificationItem = {
            id: nid,
            chat_id: data.chat_id!,
            chat_kind: String(data.chat_kind ?? ''),
            preview: String(data.preview ?? 'Сообщение'),
            sender_profile_id: Number(data.sender_profile_id ?? 0),
            message: data.message!,
            at: Date.now(),
          }
          return [next, ...prev].slice(0, 80)
        })
        pushToast(String(data.preview ?? 'Новое сообщение'), data.chat_id)
      } catch {
        /* ignore */
      }
    }
    return () => {
      ws.close()
    }
  }, [token, pushToast])

  const clearAll = useCallback(() => setItems([]), [])
  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
  }, [])
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const value = useMemo(
    () => ({ items, clearAll, remove, toasts, dismissToast }),
    [items, clearAll, remove, toasts, dismissToast],
  )

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {toasts.length ? (
        <div className="toast-stack" aria-live="polite">
          {toasts.map((t) => (
            <button
              key={t.id}
              type="button"
              className="toast-item"
              onClick={() => {
                dismissToast(t.id)
                navigate(`/chats/${t.chatId}`)
              }}
              title="Открыть чат"
            >
              {t.text}
            </button>
          ))}
        </div>
      ) : null}
    </NotificationContext.Provider>
  )
}

export function useNotifications(): NotificationState {
  const ctx = useContext(NotificationContext)
  if (!ctx) {
    return {
      items: [],
      clearAll: () => {},
      remove: () => {},
      toasts: [],
      dismissToast: () => {},
    }
  }
  return ctx
}
