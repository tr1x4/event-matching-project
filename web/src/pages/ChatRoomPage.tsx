import {
  ArrowLeftIcon,
  BellIcon,
  BellSlashIcon,
  EllipsisVerticalIcon,
  MicrophoneIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChatVoicePlayer } from '../components/ChatVoicePlayer'
import { ConfirmModal } from '../components/ConfirmModal'
import {
  blockDmProfile,
  chatAssetAbsUrl,
  chatAvatarSrc,
  chatWebSocketUrl,
  deleteChatForAll,
  deleteChatMessage,
  editChatMessage,
  fetchChatMembers,
  fetchChatMeta,
  fetchChatMessages,
  fetchEvent,
  fetchProfilePublic,
  getToken,
  markChatRead,
  muteChatMember,
  purgeAllChatMessages,
  sendChatMessage,
  setChatNotifyMuted,
  unblockDmProfile,
  uploadChatFile,
  uploadChatVoice,
  userFacingRequestError,
  type ChatAttachment,
  type ChatMemberRow,
  type ChatMessage,
  type ChatMeta,
  type MuteDuration,
  type Profile,
} from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { formatChatMessageTime, formatVoiceClock, mergeReadCursors, parseMemberReadCursors } from '../utils/chatUi'
import './ChatPages.css'
import './ProfilePage.css'

const MAX_PENDING_ATTACHMENTS = 80

type WsPayload =
  | { type: 'message'; message: ChatMessage }
  | { type: 'message_edited'; message: ChatMessage }
  | { type: 'message_deleted'; message_id: number }
  | { type: 'read'; profile_id: number; last_read_message_id: number }
  | { type: 'chat_deleted'; chat_id: number }
  | { type: 'history_purged'; chat_id: number }
  | { type: 'typing'; profile_id: number }

function isMediaAtt(a: ChatAttachment): boolean {
  const k = String(a.kind ?? '').toLowerCase()
  if (k === 'image' || k === 'video') return true
  const mime = String(a.mime ?? '').toLowerCase()
  return mime.startsWith('image/') || mime.startsWith('video/')
}

function isAudioAtt(a: ChatAttachment): boolean {
  const k = String(a.kind ?? '').toLowerCase()
  if (k === 'audio') return true
  const mime = String(a.mime ?? '').toLowerCase()
  return mime.startsWith('audio/')
}

function splitAttachments(attachments: ChatAttachment[]): { media: ChatAttachment[]; files: ChatAttachment[] } {
  const media: ChatAttachment[] = []
  const files: ChatAttachment[] = []
  for (const a of attachments) {
    if (isMediaAtt(a)) media.push(a)
    else files.push(a)
  }
  return { media, files }
}

function mergeSortedMessages(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const map = new Map<number, ChatMessage>()
  for (const x of prev) map.set(x.id, x)
  for (const x of incoming) map.set(x.id, x)
  return [...map.values()].sort((a, b) => a.id - b.id)
}

export function ChatRoomPage() {
  const { chatId: chatIdParam } = useParams()
  const chatId = Number.parseInt(chatIdParam ?? '', 10)
  const navigate = useNavigate()
  const { token } = useAuth()
  const { profile, refreshProfile } = useProfile()

  const [meta, setMeta] = useState<ChatMeta | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [profiles, setProfiles] = useState<Record<number, Profile | null>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [wsOn, setWsOn] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [peerReads, setPeerReads] = useState<Record<number, number>>({})
  const scrollRef = useRef<HTMLDivElement | null>(null)
  /** Чтобы не прокручивать вниз при каждом обновлении меты (опрос), только при появлении новых сообщений. */
  const scrollAnchorRef = useRef({ len: 0, lastId: 0 })
  const [pendingAtt, setPendingAtt] = useState<ChatAttachment[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [muteOpen, setMuteOpen] = useState(false)
  const [members, setMembers] = useState<ChatMemberRow[]>([])
  const [eventCompleted, setEventCompleted] = useState(false)
  const [recording, setRecording] = useState(false)
  const [muteTargetId, setMuteTargetId] = useState<number | null>(null)
  const [muteDuration, setMuteDuration] = useState<MuteDuration>('1h')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [typingUserIds, setTypingUserIds] = useState<Set<number>>(() => new Set())
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState<number | null>(null)
  const [confirmPurgeHistory, setConfirmPurgeHistory] = useState(false)
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(false)
  const [chatModalBusy, setChatModalBusy] = useState(false)
  const [voiceDraft, setVoiceDraft] = useState<Blob | null>(null)
  const [activeMsgId, setActiveMsgId] = useState<number | null>(null)
  const [recSec, setRecSec] = useState(0)
  const [peerBlockBusy, setPeerBlockBusy] = useState(false)

  useBodyScrollLock(muteOpen)

  const recordStreamRef = useRef<MediaStream | null>(null)

  const composeLocked = useMemo(
    () => Boolean(meta?.read_only || (meta?.kind === 'dm' && Boolean(meta?.dm_cannot_send))),
    [meta],
  )

  const showChatMenu = useMemo(
    () => Boolean(meta && (meta.kind === 'dm' || !composeLocked)),
    [meta, composeLocked],
  )

  const peerProfileId = meta?.peer_profile_id
  const iBlockedPeer = useMemo(
    () =>
      peerProfileId != null && profile?.dm_blocked_profile_ids
        ? profile.dm_blocked_profile_ids.includes(peerProfileId)
        : false,
    [peerProfileId, profile?.dm_blocked_profile_ids],
  )

  const voicePreviewUrl = useMemo(() => (voiceDraft ? URL.createObjectURL(voiceDraft) : null), [voiceDraft])
  useEffect(() => {
    return () => {
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl)
    }
  }, [voicePreviewUrl])

  useEffect(() => {
    if (!recording) {
      setRecSec(0)
      return
    }
    const t0 = Date.now()
    const id = window.setInterval(() => {
      setRecSec(Math.floor((Date.now() - t0) / 1000))
    }, 400)
    return () => clearInterval(id)
  }, [recording])

  const stopRecWaveform = useCallback(() => {
    recordStreamRef.current?.getTracks().forEach((t) => t.stop())
    recordStreamRef.current = null
  }, [])

  const fileRef = useRef<HTMLInputElement | null>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const menuWrapRef = useRef<HTMLDivElement | null>(null)
  const typingTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSentRef = useRef(0)
  const inputRef = useRef(input)
  const discardNextVoiceStopRef = useRef(false)
  const profilesRef = useRef(profiles)
  profilesRef.current = profiles
  const profileFetchInflightRef = useRef<Set<number>>(new Set())
  inputRef.current = input

  useEffect(() => {
    profileFetchInflightRef.current.clear()
    setReplyTo(null)
    setEditingId(null)
    setEditText('')
    setInput('')
    setPendingAtt([])
    setMenuOpen(false)
    setMuteOpen(false)
    setConfirmDeleteMsgId(null)
    setConfirmPurgeHistory(false)
    setConfirmDeleteChat(false)
    setChatModalBusy(false)
    setVoiceDraft(null)
    setActiveMsgId(null)
    setTypingUserIds(new Set())
    setPeerReads({})
    scrollAnchorRef.current = { len: 0, lastId: 0 }
    setError(null)
    const rec = mediaRecRef.current
    if (rec && rec.state === 'recording') {
      discardNextVoiceStopRef.current = true
      try {
        rec.stop()
      } catch {
        discardNextVoiceStopRef.current = false
      }
    }
    mediaRecRef.current = null
    chunksRef.current = []
    setRecording(false)
    stopRecWaveform()
  }, [chatId, stopRecWaveform])

  const myPid = profile?.id ?? null

  const load = useCallback(async () => {
    if (!Number.isFinite(chatId)) return
    setError(null)
    setLoading(true)
    try {
      const m = await fetchChatMeta(chatId)
      setMeta(m)
      setPeerReads(parseMemberReadCursors(m))
      const list = await fetchChatMessages(chatId, 0, 100)
      setMessages(list)
      const ids = new Set<number>()
      for (const msg of list) {
        ids.add(msg.sender_profile_id)
        const rp = msg.reply_preview?.sender_profile_id
        if (typeof rp === 'number' && rp > 0) ids.add(rp)
      }
      const next: Record<number, Profile | null> = {}
      for (const pid of ids) {
        try {
          next[pid] = await fetchProfilePublic(pid)
        } catch {
          next[pid] = null
        }
      }
      setProfiles(next)
      const maxId = list.reduce((acc, x) => Math.max(acc, x.id), 0)
      if (maxId > 0) await markChatRead(chatId, maxId)
    } catch (e) {
      setError(userFacingRequestError(e))
      setMeta(null)
      setMessages([])
      setPeerReads({})
    } finally {
      setLoading(false)
    }
  }, [chatId])

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    void load()
  }, [token, load, navigate])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible' || !Number.isFinite(chatId)) return
      void fetchChatMeta(chatId)
        .then((m) => {
          setMeta(m)
          setPeerReads((prev) => mergeReadCursors(prev, parseMemberReadCursors(m)))
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [chatId])

  useEffect(() => {
    if (!meta?.event_id || meta.kind !== 'event') {
      setEventCompleted(false)
      return
    }
    let c = false
    void fetchEvent(meta.event_id).then((ev) => {
      if (!c) setEventCompleted(Boolean(ev?.completed_flag) || String(ev?.status ?? '') === 'completed')
    })
    return () => {
      c = true
    }
  }, [meta?.event_id, meta?.kind])

  useEffect(() => {
    if (!meta || !Number.isFinite(chatId) || meta.kind !== 'event' || meta.read_only) {
      setMembers([])
      return
    }
    if (myPid == null || meta.owner_profile_id !== myPid) {
      setMembers([])
      return
    }
    let c = false
    void fetchChatMembers(chatId)
      .then((rows) => {
        if (!c) setMembers(rows)
      })
      .catch(() => {
        if (!c) setMembers([])
      })
    return () => {
      c = true
    }
  }, [meta, chatId, myPid])

  useEffect(() => {
    if (!meta || meta.read_only) return
    const el = scrollRef.current
    if (!el) return
    const lastId = messages.length ? messages[messages.length - 1].id : 0
    const len = messages.length
    const anchor = scrollAnchorRef.current
    const isInitialFill = anchor.lastId === 0 && lastId > 0
    const newTailMessage = lastId > anchor.lastId
    scrollAnchorRef.current = { len, lastId }
    if (!isInitialFill && !newTailMessage) return
    el.scrollTop = el.scrollHeight
  }, [messages, meta?.read_only])

  useEffect(() => {
    if (!Number.isFinite(chatId) || !token) return
    const access = getToken()
    if (!access) return
    const url = chatWebSocketUrl(chatId, access)
    const ws = new WebSocket(url)
    wsRef.current = ws
    ws.onopen = () => setWsOn(true)
    ws.onclose = () => {
      setWsOn(false)
      wsRef.current = null
    }
    ws.onerror = () => setWsOn(false)
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as WsPayload
        if (data.type === 'message') {
          const incoming = data.message
          setMessages((prev) => (prev.some((x) => x.id === incoming.id) ? prev : [...prev, incoming]))
          if (incoming.sender_profile_id !== myPid) {
            void markChatRead(chatId, incoming.id)
          }
          const prefetch = (pid: number) => {
            if (!Number.isFinite(pid) || pid <= 0) return
            const row = profilesRef.current[pid]
            if (row !== undefined && row !== null) return
            if (profileFetchInflightRef.current.has(pid)) return
            profileFetchInflightRef.current.add(pid)
            void fetchProfilePublic(pid)
              .then((p) => setProfiles((prev) => ({ ...prev, [pid]: p })))
              .catch(() => setProfiles((prev) => ({ ...prev, [pid]: null })))
              .finally(() => profileFetchInflightRef.current.delete(pid))
          }
          prefetch(incoming.sender_profile_id)
          const rpid = incoming.reply_preview?.sender_profile_id
          if (typeof rpid === 'number') prefetch(rpid)
        } else if (data.type === 'message_edited') {
          setMessages((prev) => prev.map((x) => (x.id === data.message.id ? data.message : x)))
        } else if (data.type === 'message_deleted') {
          setMessages((prev) => prev.filter((x) => x.id !== data.message_id))
        } else if (data.type === 'read') {
          setPeerReads((prev) => ({
            ...prev,
            [data.profile_id]: Math.max(prev[data.profile_id] ?? 0, data.last_read_message_id),
          }))
        } else if (data.type === 'chat_deleted') {
          setError('Чат удалён организатором')
        } else if (data.type === 'history_purged') {
          setMessages([])
          setPeerReads({})
          setTypingUserIds(new Set())
        } else if (data.type === 'typing') {
          if (myPid != null && data.profile_id === myPid) return
          setTypingUserIds((prev) => {
            const n = new Set(prev)
            n.add(data.profile_id)
            return n
          })
          const prevT = typingTimeoutsRef.current[data.profile_id]
          if (prevT) clearTimeout(prevT)
          typingTimeoutsRef.current[data.profile_id] = setTimeout(() => {
            setTypingUserIds((prev) => {
              const n = new Set(prev)
              n.delete(data.profile_id)
              return n
            })
            delete typingTimeoutsRef.current[data.profile_id]
          }, 3200)
        }
      } catch {
        /* ignore */
      }
    }
    return () => {
      for (const t of Object.values(typingTimeoutsRef.current)) clearTimeout(t)
      typingTimeoutsRef.current = {}
      ws.close()
      wsRef.current = null
    }
  }, [chatId, token, myPid])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setMuteOpen(false)
        setReplyTo(null)
        setEditingId(null)
        setEditText('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  useEffect(() => {
    if (activeMsgId == null) return
    const down = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.('[data-chat-bubble="1"]')
      const mid = el ? Number(el.getAttribute('data-msg-id')) : NaN
      if (Number.isFinite(mid) && mid === activeMsgId) return
      setActiveMsgId(null)
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [activeMsgId])

  useEffect(() => {
    if (!meta || composeLocked || !inputRef.current.trim() || !wsOn) return
    const sendTyping = () => {
      const w = wsRef.current
      if (!inputRef.current.trim()) return
      if (w?.readyState === WebSocket.OPEN) {
        w.send(JSON.stringify({ type: 'typing' }))
        lastTypingSentRef.current = Date.now()
      }
    }
    const now = Date.now()
    if (now - lastTypingSentRef.current >= 2600) {
      sendTyping()
      return
    }
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
    typingDebounceRef.current = setTimeout(() => {
      typingDebounceRef.current = null
      sendTyping()
    }, 450)
    return () => {
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
    }
  }, [input, meta, wsOn, composeLocked])

  const maxPeerReadOther = useMemo(() => {
    if (myPid == null) return 0
    let m = 0
    for (const [pid, v] of Object.entries(peerReads)) {
      if (Number(pid) === myPid) continue
      m = Math.max(m, v)
    }
    return m
  }, [peerReads, myPid])

  const typingLine = useMemo(() => {
    if (!typingUserIds.size) return null
    const parts: string[] = []
    for (const pid of typingUserIds) {
      parts.push(profiles[pid]?.name?.trim() || `Участник #${pid}`)
    }
    return parts.join(', ')
  }, [typingUserIds, profiles])

  const sendVoiceBlob = async (blob: Blob) => {
    if (!meta || composeLocked || !Number.isFinite(chatId)) return
    setSending(true)
    setError(null)
    try {
      const path = await uploadChatVoice(chatId, blob)
      const arr = await sendChatMessage(chatId, {
        voice_path: path,
        ...(replyTo ? { reply_to_message_id: replyTo.id } : {}),
      })
      setReplyTo(null)
      setVoiceDraft(null)
      setMessages((prev) => mergeSortedMessages(prev, arr))
      const maxId = arr.reduce((a, x) => Math.max(a, x.id), 0)
      if (maxId) void markChatRead(chatId, maxId)
    } catch (e) {
      const raw = userFacingRequestError(e)
      setError(raw.includes('Отправка недоступна') ? 'Отправка сейчас недоступна' : raw)
    } finally {
      setSending(false)
    }
  }

  const startRec = async () => {
    if (!meta || composeLocked || recording || voiceDraft) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordStreamRef.current = stream
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        stopRecWaveform()
        setRecording(false)
        mediaRecRef.current = null
        if (discardNextVoiceStopRef.current) {
          discardNextVoiceStopRef.current = false
          chunksRef.current = []
          return
        }
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (blob.size > 400) {
          setVoiceDraft(blob)
        } else setError('Запись слишком короткая')
      }
      rec.start()
      mediaRecRef.current = rec
      setRecording(true)
    } catch {
      setError('Нет доступа к микрофону')
      stopRecWaveform()
    }
  }

  const stopRecToDraft = () => {
    mediaRecRef.current?.stop()
  }

  const cancelVoiceSession = () => {
    if (recording) {
      discardNextVoiceStopRef.current = true
      mediaRecRef.current?.stop()
    }
    setVoiceDraft(null)
  }

  const onSend = async () => {
    if (!meta || composeLocked || !Number.isFinite(chatId)) return
    const text = input.trim()
    if (!text && !pendingAtt.length) return
    if (sending) return
    setSending(true)
    setError(null)
    try {
      const payload: { body?: string; attachments_json?: string; reply_to_message_id?: number } = {}
      if (text) payload.body = text
      if (pendingAtt.length) payload.attachments_json = JSON.stringify(pendingAtt)
      if (replyTo) payload.reply_to_message_id = replyTo.id
      const arr = await sendChatMessage(chatId, payload)
      setReplyTo(null)
      setMessages((prev) => mergeSortedMessages(prev, arr))
      setInput('')
      setPendingAtt([])
      const maxId = arr.reduce((a, x) => Math.max(a, x.id), 0)
      if (maxId) void markChatRead(chatId, maxId)
    } catch (e) {
      const raw = userFacingRequestError(e)
      setError(raw.includes('Отправка недоступна') ? 'Отправка сейчас недоступна' : raw)
    } finally {
      setSending(false)
    }
  }

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length || !meta || composeLocked || !Number.isFinite(chatId)) return
    const room = MAX_PENDING_ATTACHMENTS - pendingAtt.length
    if (room <= 0) {
      setError(`Не более ${MAX_PENDING_ATTACHMENTS} вложений в очереди`)
      return
    }
    setError(null)
    const list = [...files].slice(0, room)
    setSending(true)
    try {
      const next: ChatAttachment[] = [...pendingAtt]
      for (const f of list) {
        const item = await uploadChatFile(chatId, f)
        next.push(item)
      }
      setPendingAtt(next)
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setSending(false)
    }
  }

  const onToggleNotify = async () => {
    if (!meta || !Number.isFinite(chatId)) return
    try {
      await setChatNotifyMuted(chatId, !meta.notify_muted)
      setMeta({ ...meta, notify_muted: !meta.notify_muted })
    } catch (e) {
      setError(userFacingRequestError(e))
    }
  }

  const startEdit = (msg: ChatMessage) => {
    if (!msg.body) return
    setEditingId(msg.id)
    setEditText(msg.body)
  }

  const saveEdit = async () => {
    if (editingId == null || !Number.isFinite(chatId)) return
    const t = editText.trim()
    if (!t) return
    try {
      const updated = await editChatMessage(chatId, editingId, t)
      setMessages((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      setEditingId(null)
      setEditText('')
    } catch (e) {
      setError(userFacingRequestError(e))
    }
  }

  const onDeleteMessageConfirmed = async () => {
    if (!Number.isFinite(chatId) || confirmDeleteMsgId == null) return
    setChatModalBusy(true)
    setError(null)
    try {
      await deleteChatMessage(chatId, confirmDeleteMsgId)
      setMessages((prev) => prev.filter((x) => x.id !== confirmDeleteMsgId))
      setConfirmDeleteMsgId(null)
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setChatModalBusy(false)
    }
  }

  const onPurgeHistoryConfirmed = async () => {
    if (!Number.isFinite(chatId)) return
    setChatModalBusy(true)
    setError(null)
    try {
      await purgeAllChatMessages(chatId)
      setConfirmPurgeHistory(false)
      await load()
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setChatModalBusy(false)
    }
  }

  const onDeleteChatConfirmed = async () => {
    if (!Number.isFinite(chatId)) return
    setChatModalBusy(true)
    setError(null)
    try {
      await deleteChatForAll(chatId)
      setConfirmDeleteChat(false)
      navigate('/chats')
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setChatModalBusy(false)
    }
  }

  if (!token) return null

  if (!Number.isFinite(chatId)) {
    return (
      <div className="card wide">
        <p className="error">Некорректный чат</p>
        <Link to="/chats" className="btn ghost">
          К списку
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="card wide">
        <p className="muted">Загрузка чата</p>
      </div>
    )
  }

  if (error && !meta) {
    return (
      <div className="card wide">
        <p className="error">{error}</p>
        <Link to="/chats" className="btn ghost">
          К списку чатов
        </Link>
      </div>
    )
  }

  if (!meta) return null

  const eventLink = meta.kind === 'event' && meta.event_id ? `/events/${meta.event_id}` : null
  const isEventOwner = meta.kind === 'event' && myPid != null && meta.owner_profile_id === myPid

  const canDeleteMessage = (msg: ChatMessage) => {
    if (myPid == null) return false
    if (msg.sender_profile_id === myPid) return true
    if (meta.kind === 'event' && isEventOwner) return true
    if (meta.kind === 'dm') return true
    return false
  }

  const muteCandidates = members.filter(
    (m) => m.profile_id !== myPid && m.profile_id !== meta.owner_profile_id && m.role !== 'owner',
  )

  return (
    <div className="card wide chat-room">
      <div className="chat-room-top">
        <Link to="/chats" className="btn ghost small chat-room-back" aria-label="Назад">
          <ArrowLeftIcon width={20} height={20} />
        </Link>
        <div className="chat-room-peer">
          <img src={chatAvatarSrc(meta)} width={44} height={44} alt="" />
          <div style={{ minWidth: 0 }}>
            <h1>{meta.title?.trim() || `Чат #${meta.id}`}</h1>
            {meta.subtitle ? (
              <p className="muted" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {meta.subtitle.slice(0, 120)}
                {meta.subtitle.length > 120 ? '…' : ''}
              </p>
            ) : null}
          </div>
        </div>
        <div className="chat-room-actions">
          <span
            className={`chat-ws-dot${wsOn ? ' on' : ''}`}
            title={wsOn ? 'Соединение активно' : 'Нет соединения'}
          />
          <button
            type="button"
            className="btn ghost small"
            title={meta.notify_muted ? 'Включить уведомления по этому чату' : 'Отключить уведомления'}
            onClick={() => void onToggleNotify()}
          >
            {meta.notify_muted ? <BellSlashIcon width={20} height={20} /> : <BellIcon width={20} height={20} />}
          </button>
          {showChatMenu ? (
            <div className="chat-menu-wrap" ref={menuWrapRef}>
              <button
                type="button"
                className="btn ghost small"
                aria-expanded={menuOpen}
                aria-label="Меню чата"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <EllipsisVerticalIcon width={22} height={22} />
              </button>
              {menuOpen ? (
                <div className="chat-menu-dropdown" role="menu">
                  {meta.kind === 'dm' && peerProfileId ? (
                    <button
                      type="button"
                      className="chat-menu-item"
                      disabled={peerBlockBusy}
                      onClick={() => {
                        setMenuOpen(false)
                        void (async () => {
                          setPeerBlockBusy(true)
                          setError(null)
                          try {
                            if (iBlockedPeer) await unblockDmProfile(peerProfileId)
                            else await blockDmProfile(peerProfileId)
                            await refreshProfile({ quiet: true })
                            const m = await fetchChatMeta(chatId)
                            setMeta(m)
                            setPeerReads((prev) => mergeReadCursors(prev, parseMemberReadCursors(m)))
                          } catch (e) {
                            setError(userFacingRequestError(e))
                          } finally {
                            setPeerBlockBusy(false)
                          }
                        })()
                      }}
                    >
                      {peerBlockBusy ? 'Подождите' : iBlockedPeer ? 'Разблокировать' : 'Заблокировать'}
                    </button>
                  ) : null}
                  {meta.kind === 'dm' ? (
                    <button
                      type="button"
                      className="chat-menu-item danger"
                      onClick={() => {
                        setMenuOpen(false)
                        setConfirmPurgeHistory(true)
                      }}
                    >
                      Очистить историю
                    </button>
                  ) : null}
                  {isEventOwner && eventCompleted ? (
                    <button
                      type="button"
                      className="chat-menu-item danger"
                      onClick={() => {
                        setMenuOpen(false)
                        setConfirmPurgeHistory(true)
                      }}
                    >
                      Очистить историю для всех
                    </button>
                  ) : null}
                  {isEventOwner && eventCompleted ? (
                    <button
                      type="button"
                      className="chat-menu-item danger"
                      onClick={() => {
                        setMenuOpen(false)
                        setConfirmDeleteChat(true)
                      }}
                    >
                      Удалить чат для всех
                    </button>
                  ) : null}
                  {isEventOwner && muteCandidates.length ? (
                    <button
                      type="button"
                      className="chat-menu-item"
                      onClick={() => {
                        setMenuOpen(false)
                        setMuteTargetId(muteCandidates[0]?.profile_id ?? null)
                        setMuteOpen(true)
                      }}
                    >
                      Замутить участника
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {eventLink ? (
            <Link to={eventLink} className="btn small">
              Событие
            </Link>
          ) : null}
          {meta.kind === 'dm' && meta.peer_profile_id ? (
            <Link to={`/profiles/${meta.peer_profile_id}`} className="btn ghost small">
              Профиль
            </Link>
          ) : null}
        </div>
      </div>

      {muteOpen ? (
        <div
          className="chat-modal-overlay"
          role="dialog"
          aria-modal
          onClick={() => setMuteOpen(false)}
        >
          <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="chat-modal-head">
              <h3 className="chat-modal-title">Мут участника</h3>
            </div>
            <div className="chat-modal-body prm-scrollbar">
              <label className="field-label">Участник</label>
              <select
                className="field-input"
                value={muteTargetId ?? ''}
                onChange={(e) => setMuteTargetId(Number.parseInt(e.target.value, 10) || null)}
              >
                {muteCandidates.map((m) => (
                  <option key={m.profile_id} value={m.profile_id}>
                    {profiles[m.profile_id]?.name?.trim() || `Профиль #${m.profile_id}`}
                  </option>
                ))}
              </select>
              <label className="field-label" style={{ marginTop: '0.65rem' }}>
                Срок
              </label>
              <select
                className="field-input"
                value={muteDuration}
                onChange={(e) => setMuteDuration(e.target.value as MuteDuration)}
              >
                <option value="1h">1 час</option>
                <option value="3h">3 часа</option>
                <option value="8h">8 часов</option>
                <option value="1d">1 день</option>
              </select>
            </div>
            <div className="chat-modal-foot">
              <div className="chat-modal-actions">
                <button type="button" className="btn ghost" onClick={() => setMuteOpen(false)}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={muteTargetId == null}
                  onClick={() => {
                    if (muteTargetId == null) return
                    void muteChatMember(chatId, muteTargetId, muteDuration)
                      .then(() => {
                        setMuteOpen(false)
                        void fetchChatMembers(chatId).then(setMembers)
                      })
                      .catch((e) => setError(userFacingRequestError(e)))
                  }}
                >
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <p className="error" style={{ marginBottom: '0.5rem' }}>{error}</p> : null}

      {typingLine ? <div className="chat-typing-line muted">{typingLine} печатает</div> : null}

      <div className="chat-room-scroll prm-scrollbar" ref={scrollRef}>
        {messages.map((msg) => {
          if (msg.is_system) {
            const line = (msg.body ?? '').trim() || 'Системное сообщение'
            return (
              <div key={msg.id} className="chat-system-row" role="status">
                <div className="chat-system-line">{line}</div>
              </div>
            )
          }
          const mine = myPid != null && msg.sender_profile_id === myPid
          const pr = profiles[msg.sender_profile_id]
          const name = pr?.name?.trim() || `Участник #${msg.sender_profile_id}`
          const readByOther = mine && maxPeerReadOther >= msg.id
          const { media, files } = splitAttachments(msg.attachments ?? [])
          const audioFiles = files.filter((a) => isAudioAtt(a))
          const otherFiles = files.filter((a) => !isAudioAtt(a))

          return (
            <div
              key={msg.id}
              className={`chat-bubble-row${mine ? ' mine' : ''}${activeMsgId === msg.id ? ' chat-bubble-row--open' : ''}`}
            >
              {!mine ? <span className="chat-bubble-author muted">{name}</span> : null}
              <div
                className="chat-bubble-wrap"
                data-chat-bubble="1"
                data-msg-id={msg.id}
                onClick={(e) => {
                  const t = e.target as HTMLElement
                  if (t.closest('button, a, audio, video, textarea, input, .chat-msg-actions, .chat-voice-card')) return
                  setActiveMsgId((v) => (v === msg.id ? null : msg.id))
                }}
              >
                <div className="chat-bubble">
                  {msg.reply_preview ? (
                    <div className="chat-reply-snippet">
                      <span className="chat-reply-snippet-author">
                        {profiles[msg.reply_preview.sender_profile_id]?.name?.trim() ||
                          `Участник #${msg.reply_preview.sender_profile_id}`}
                      </span>
                      <span className="chat-reply-snippet-text">{msg.reply_preview.snippet}</span>
                    </div>
                  ) : null}
                  {msg.voice_path ? <ChatVoicePlayer src={msg.voice_path} /> : null}
                  {editingId === msg.id ? (
                    <div className="chat-msg-edit-wrap">
                      <textarea className="chat-msg-edit-textarea" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                      <div className="chat-msg-edit-actions">
                        <button type="button" className="btn small" onClick={() => void saveEdit()}>
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => {
                            setEditingId(null)
                            setEditText('')
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.body ? <p className="chat-msg-body">{msg.body}</p> : null}
                      {media.length ? (
                        <div className="chat-attach-strip">
                          {media.map((a, i) => {
                            const u = typeof a.url === 'string' ? chatAssetAbsUrl(a.url) : ''
                            const mk = `${msg.id}-m-${i}-${u || String(a.name ?? '')}`
                            const k = String(a.kind ?? '').toLowerCase()
                            if (k === 'video' || String(a.mime ?? '').startsWith('video/')) {
                              return u ? <video key={mk} src={u} controls muted /> : null
                            }
                            return u ? <img key={mk} src={u} alt="" /> : null
                          })}
                        </div>
                      ) : null}
                      {audioFiles.length ? (
                        <div className="chat-audio-list">
                          {audioFiles.map((a, i) => {
                            const raw = typeof a.url === 'string' ? a.url : ''
                            const u = raw ? chatAssetAbsUrl(raw) : ''
                            const label = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : `Трек ${i + 1}`
                            return (
                              <div key={`a-${i}`} className="chat-audio-row">
                                {raw ? <ChatVoicePlayer src={raw} caption={label} /> : <div className="chat-audio-name">{label}</div>}
                                {u ? (
                                  <a href={u} download className="chat-file-link">
                                    Скачать
                                  </a>
                                ) : null}
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                      {otherFiles.length ? (
                        <ul className="chat-file-list">
                          {otherFiles.map((a, i) => {
                            const u = typeof a.url === 'string' ? chatAssetAbsUrl(a.url) : ''
                            const label = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : u || `Файл ${i + 1}`
                            return (
                              <li key={i}>
                                {u ? (
                                  <a href={u} download className="chat-file-link">
                                    {label}
                                  </a>
                                ) : (
                                  label
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </>
                  )}
                  <div className="chat-bubble-meta-row" onClick={(e) => e.stopPropagation()}>
                    <span className="chat-msg-time">{formatChatMessageTime(msg.created_at)}</span>
                    {msg.edited ? <span className="chat-msg-edited">ред.</span> : null}
                    {mine && msg.sender_profile_id === myPid ? (
                      <span className={readByOther ? 'chat-bubble-read' : ''} title={readByOther ? 'Прочитано' : ''}>
                        {readByOther ? '✓✓' : '✓'}
                      </span>
                    ) : null}
                    {!composeLocked && editingId !== msg.id ? (
                      <div className="chat-msg-actions">
                        <button type="button" className="btn ghost small chat-msg-action-btn" onClick={() => setReplyTo(msg)}>
                          Ответить
                        </button>
                        {mine && !msg.voice_path && msg.body ? (
                          <button type="button" className="btn ghost small chat-msg-action-btn" onClick={() => startEdit(msg)}>
                            Изм.
                          </button>
                        ) : null}
                        {canDeleteMessage(msg) ? (
                          <button type="button" className="btn ghost small chat-msg-action-btn" onClick={() => setConfirmDeleteMsgId(msg.id)}>
                            Удалить
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {meta.kind === 'dm' && Boolean(meta.dm_cannot_send) && !meta.read_only ? (
        <div className="chat-dm-block-banner" role="status">
          {meta.they_blocked_me
            ? 'Пользователь ограничил возможность отправки сообщений.'
            : meta.i_blocked_them
              ? 'Вы ограничили возможность отправки сообщений данному пользователю'
              : 'Отправка сообщений сейчас недоступна.'}
        </div>
      ) : null}

      {meta.read_only ? (
        <div className="chat-compose-readonly">
          {meta.kind === 'event'
            ? 'Вы покинули событие — новые сообщения недоступны, отображается история на момент выхода.'
            : 'Этот чат только для чтения.'}
        </div>
      ) : composeLocked ? null : (
        <>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="chat-file-input-hidden"
            onChange={(e) => {
              void onPickFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {recording ? (
            <div className="chat-recording-panel">
              <div className="chat-recording-head">
                <span className="chat-recording-dot" aria-hidden />
                <div className="chat-recording-label">Запись голосового</div>
                <div className="chat-recording-timer">{formatVoiceClock(recSec)}</div>
              </div>
              <div className="chat-recording-actions">
                <button type="button" className="btn ghost" disabled={sending} onClick={() => cancelVoiceSession()}>
                  Отмена
                </button>
                <button type="button" className="btn primary" disabled={sending} onClick={() => stopRecToDraft()}>
                  Остановить запись
                </button>
              </div>
            </div>
          ) : null}
          {!recording && voiceDraft && voicePreviewUrl ? (
            <div className="chat-voice-draft-panel">
              <ChatVoicePlayer src={voicePreviewUrl} />
              <div className="chat-voice-draft-actions">
                <button type="button" className="btn ghost" disabled={sending} onClick={() => cancelVoiceSession()}>
                  Удалить запись
                </button>
                <button type="button" className="btn primary" disabled={sending} onClick={() => void sendVoiceBlob(voiceDraft)}>
                  {sending ? 'Отправка' : 'Отправить голосовое'}
                </button>
              </div>
            </div>
          ) : null}
          {!recording && !voiceDraft ? (
            <>
              {replyTo ? (
                <div className="chat-reply-compose-bar">
                  <div className="chat-reply-compose-inner">
                    <span className="muted">Ответ на </span>
                    <strong>{profiles[replyTo.sender_profile_id]?.name?.trim() || `#${replyTo.sender_profile_id}`}</strong>
                    <span className="chat-reply-compose-snippet">
                      {(replyTo.body || '').trim().slice(0, 120)}
                      {(replyTo.body || '').trim().length > 120 ? '…' : ''}
                      {!replyTo.body?.trim() && replyTo.voice_path ? 'Голосовое' : ''}
                      {!replyTo.body?.trim() && !replyTo.voice_path && (replyTo.attachments?.length ?? 0) > 0
                        ? 'Вложение'
                        : ''}
                    </span>
                  </div>
                  <button type="button" className="btn ghost small" aria-label="Отменить ответ" onClick={() => setReplyTo(null)}>
                    ×
                  </button>
                </div>
              ) : null}
              {pendingAtt.length ? (
                <div className="chat-pending-bar">
                  {pendingAtt.map((a, i) => (
                    <span key={i} className="chat-pending-chip">
                      {String(a.name || 'файл')}
                      <button
                        type="button"
                        className="chat-pending-x"
                        aria-label="Убрать"
                        onClick={() => setPendingAtt((prev) => prev.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="chat-compose">
                <button
                  type="button"
                  className="btn ghost small chat-compose-icon"
                  title="Прикрепить файлы"
                  disabled={sending || pendingAtt.length >= MAX_PENDING_ATTACHMENTS}
                  onClick={() => fileRef.current?.click()}
                >
                  <PaperClipIcon width={22} height={22} />
                </button>
                <button
                  type="button"
                  className="btn ghost small chat-compose-icon"
                  title="Записать голосовое"
                  disabled={sending}
                  onClick={() => void startRec()}
                >
                  <MicrophoneIcon width={22} height={22} />
                </button>
                <textarea
                  className="chat-compose-textarea"
                  placeholder="Сообщение"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void onSend()
                    }
                  }}
                  rows={2}
                />
                <button
                  type="button"
                  className="btn primary chat-compose-send"
                  disabled={sending || (!input.trim() && !pendingAtt.length)}
                  onClick={() => void onSend()}
                >
                  {sending ? 'Отправка' : 'Отправить'}
                </button>
              </div>
            </>
          ) : null}
        </>
      )}

      <ConfirmModal
        open={confirmDeleteMsgId != null}
        busy={chatModalBusy}
        title="Удалить сообщение?"
        danger
        confirmLabel="Удалить для всех"
        onClose={() => !chatModalBusy && setConfirmDeleteMsgId(null)}
        onConfirm={() => void onDeleteMessageConfirmed()}
      >
        <p style={{ margin: 0 }}>Сообщение будет удалено у всех участников чата.</p>
      </ConfirmModal>

      <ConfirmModal
        open={confirmPurgeHistory}
        busy={chatModalBusy}
        title="Очистить историю?"
        danger
        confirmLabel="Очистить"
        onClose={() => !chatModalBusy && setConfirmPurgeHistory(false)}
        onConfirm={() => void onPurgeHistoryConfirmed()}
      >
        <p style={{ margin: 0 }}>
          Все сообщения в этом чате будут удалены у всех участников. Восстановить переписку будет нельзя.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={confirmDeleteChat}
        busy={chatModalBusy}
        title="Удалить чат?"
        danger
        confirmLabel="Удалить для всех"
        onClose={() => !chatModalBusy && setConfirmDeleteChat(false)}
        onConfirm={() => void onDeleteChatConfirmed()}
      >
        <p style={{ margin: 0 }}>Чат будет удалён у всех. Восстановить будет нельзя.</p>
      </ConfirmModal>
    </div>
  )
}
