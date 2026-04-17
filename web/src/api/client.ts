import { AUTH_URL, CHATS_URL, EVENTS_URL, MATCH_URL, PROFILES_URL } from '../config'
import type { RussianCity } from '../data/russianCities'

const ACCESS_KEY = 'access_token'
const REFRESH_KEY = 'refresh_token'

/** Синхронизация React state в AuthProvider после тихого refresh. */
export const ACCESS_TOKEN_UPDATED_EVENT = 'app:access-token-updated'
/** Сессия недействительна (refresh не удался или повторный 401) — выход на логин. */
export const SESSION_INVALIDATED_EVENT = 'app:session-invalidated'

let refreshInFlight: Promise<boolean> | null = null

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export type TokenResponse = {
  access_token: string
  refresh_token: string
  user_id: number
  token_type?: string
}

export function setStoredTokens(tokens: TokenResponse): void {
  localStorage.setItem(ACCESS_KEY, tokens.access_token)
  localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

async function parseError(res: Response): Promise<string> {
  try {
    const j: unknown = await res.json()
    if (j && typeof j === 'object' && 'detail' in j) {
      const d = (j as { detail: unknown }).detail
      if (typeof d === 'string') return d
      if (Array.isArray(d))
        return d
          .map((x) => (x && typeof x === 'object' && 'msg' in x ? String((x as { msg: unknown }).msg) : ''))
          .filter(Boolean)
          .join(', ')
    }
  } catch {
    /* ignore */
  }
  const st = res.statusText
  if (st === 'Unauthorized') return 'Нет доступа'
  if (st === 'Forbidden') return 'Доступ запрещён'
  if (st === 'Not Found') return 'Не найдено'
  return st || 'Ошибка запроса'
}

/** Сообщение для пользователя при сетевых сбоях и прочих исключениях из fetch. */
export function userFacingRequestError(e: unknown): string {
  if (e instanceof TypeError && /failed to fetch/i.test(e.message)) {
    return 'Не удалось загрузить данные. Проверьте подключение к сети и повторите попытку.'
  }
  if (e instanceof Error) {
    const m = e.message.trim()
    if (/failed to fetch/i.test(m)) {
      return 'Не удалось загрузить данные. Проверьте подключение к сети и повторите попытку.'
    }
    return m || 'Не удалось выполнить запрос. Повторите попытку позже.'
  }
  return 'Не удалось выполнить запрос. Повторите попытку позже.'
}

export async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    const rt = getRefreshToken()
    if (!rt) return false
    const res = await fetch(`${AUTH_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    })
    if (!res.ok) {
      clearSession()
      return false
    }
    const data = (await res.json()) as TokenResponse
    setStoredTokens(data)
    window.dispatchEvent(new Event(ACCESS_TOKEN_UPDATED_EVENT))
    return true
  })().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

async function authorizedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const run = async () => {
    const headers = new Headers(init.headers)
    if (init.body instanceof FormData) {
      headers.delete('Content-Type')
    }
    const access = getToken()
    if (access) headers.set('Authorization', `Bearer ${access}`)
    return fetch(url, { ...init, headers })
  }

  let res = await run()
  if (res.status !== 401) return res

  if (!getRefreshToken()) {
    if (getToken()) {
      clearSession()
      window.dispatchEvent(new Event(SESSION_INVALIDATED_EVENT))
    }
    return res
  }

  const refreshed = await tryRefreshSession()
  if (!refreshed) {
    window.dispatchEvent(new Event(SESSION_INVALIDATED_EVENT))
    return res
  }

  res = await run()
  if (res.status === 401) {
    clearSession()
    window.dispatchEvent(new Event(SESSION_INVALIDATED_EVENT))
  }
  return res
}

export type UserPublic = { id: number; email: string }

export type SelectedInterest = { id: number; label_ru: string; icon: string; slug?: string }

export type ProfileGalleryItem = { id: string; url: string; kind: 'image' | 'video' }

export type QuestionnaireMeta = {
  source: 'short' | 'long' | null
  short_completed: boolean
  long_completed: boolean
  recomputed_at: string | null
}

export type Profile = {
  id: number
  user_id: number
  name: string | null
  gender?: string | null
  birth_date?: string | null
  city_name?: string | null
  bio?: string | null
  avatar_url?: string | null
  latitude?: number | null
  longitude?: number | null
  /** Есть только у своего профиля; в публичной карточке не приходит. */
  personality?: number[]
  interests: string[]
  selected_interests?: SelectedInterest[]
  is_complete?: boolean
  gallery?: ProfileGalleryItem[]
  /** Только у своего профиля (`/profiles/me`). */
  dm_privacy?: 'all' | 'acquaintances' | 'nobody'
  dm_blocked_profile_ids?: number[]
  /** Вес черт личности в подборе (α), сумма с `match_interests_weight` ≈ 1. Только `/profiles/me`. */
  match_personality_weight?: number
  /** Вес интересов в подборе (β). Только `/profiles/me`. */
  match_interests_weight?: number
  /** Метаданные анкеты Big Five. Только `/profiles/me`. */
  questionnaire?: QuestionnaireMeta
}

/** Полный URL для превью аватара: файл с profiles-service или локальная SVG-заглушка. */
export function profileAvatarSrc(profile: { avatar_url?: string | null } | null | undefined): string {
  const path = profile?.avatar_url?.trim()
  if (path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    const base = PROFILES_URL.replace(/\/$/, '')
    return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`
  }
  return '/default-avatar.svg'
}

export type ProfileSaveBody = {
  name: string
  gender: string
  birth_date: string
  city_name: string
  latitude: number
  longitude: number
  /** Необязательно при первом создании профиля */
  bio?: string
  dm_privacy?: 'all' | 'acquaintances' | 'nobody'
  match_personality_weight?: number
  match_interests_weight?: number
}

export type InterestCatalogItem = {
  id: number
  slug: string
  label_ru: string
  icon: string
}

export type EventMediaItem = { url: string; kind: 'image' | 'video'; id?: string }

export type EventDurationKey = 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'week' | 'longer'
export type ParticipantBucket = 'p2' | 'p3_4' | 'p5_9' | 'p10_plus'
export type EventLifecycleStatus = 'planned' | 'active' | 'completed'

export type Recommendation = {
  event_id: number
  title?: string | null
  description?: string | null
  latitude?: number | null
  longitude?: number | null
  expected_participants?: number | null
  category_interest_slug?: string | null
  category_slugs?: string[]
  tags?: string[]
  participants?: number[]
  media?: EventMediaItem[]
  creator_profile_id?: number | null
  match_score: number
  starts_at?: string | null
  duration_key?: EventDurationKey | string | null
  participant_bucket?: ParticipantBucket | string | null
  status?: EventLifecycleStatus | string | null
  hidden_from_discovery?: boolean | null
  /** Расстояние от точки поиска/профиля до события, км (если заданы координаты). */
  distance_km?: number | null
}

export type RecommendSearchRadius = '5' | '10' | '25' | '50' | '100' | 'russia'

export type RecommendResponse = {
  profile_id: number
  user_id: number | undefined
  /** Эхо запроса: радиус от центра города в профиле или russia. */
  search_radius?: string
  recommendations: Recommendation[]
}

export type EventCreatePayload = {
  title: string
  description: string
  latitude: number
  longitude: number
  category_slugs: string[]
  starts_at: string
  duration_key: EventDurationKey
  participant_bucket: ParticipantBucket
}

export type EventPatchPayload = {
  description?: string
  hidden_from_discovery?: boolean
  participant_bucket?: ParticipantBucket
}

/** Ответ events-service для одного события (создание / загрузка медиа / карточка). */
export type EventDetail = {
  id: number
  title: string
  description: string
  latitude: number
  longitude: number
  expected_participants: number
  category_interest_slug: string
  category_slugs?: string[]
  tags: string[]
  participants: number[]
  media: EventMediaItem[]
  creator_profile_id: number
  starts_at?: string | null
  duration_key?: EventDurationKey | string
  participant_bucket?: ParticipantBucket | string
  status?: EventLifecycleStatus | string
  hidden_from_discovery?: boolean
  completed_flag?: boolean
  blocked_profile_ids?: number[]
  /** ID чата события (приходит с join/create и из GET /events/{id}). */
  event_chat_id?: number | null
}

function mediaAbsUrl(baseUrl: string, path: string): string {
  const p = path.trim()
  if (!p) return ''
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  const base = baseUrl.replace(/\/$/, '')
  return p.startsWith('/') ? `${base}${p}` : `${base}/${p}`
}

export function eventMediaAbsUrl(path: string): string {
  return mediaAbsUrl(EVENTS_URL, path)
}

export function profileMediaAbsUrl(path: string): string {
  return mediaAbsUrl(PROFILES_URL, path)
}

export async function createEvent(body: EventCreatePayload): Promise<EventDetail> {
  const res = await authorizedFetch(`${EVENTS_URL}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EventDetail>
}

export async function fetchEvent(eventId: number): Promise<EventDetail | null> {
  const res = await fetch(`${EVENTS_URL}/events/${eventId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(await parseError(res))
  const j: unknown = await res.json()
  if (j && typeof j === 'object' && 'error' in j) return null
  return j as EventDetail
}

/** Создать чат события в chats-service, если его ещё нет (после сбоя или старых данных). */
export async function ensureEventChat(eventId: number): Promise<{ chat_id: number }> {
  const res = await authorizedFetch(`${EVENTS_URL}/events/${eventId}/event-chat/ensure`, { method: 'POST' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<{ chat_id: number }>
}

export async function fetchMyEvents(): Promise<EventDetail[]> {
  const res = await authorizedFetch(`${EVENTS_URL}/events/mine`, { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EventDetail[]>
}

export async function patchEvent(eventId: number, body: EventPatchPayload): Promise<EventDetail> {
  const res = await authorizedFetch(`${EVENTS_URL}/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EventDetail>
}

export async function deleteCompletedEvent(eventId: number): Promise<void> {
  const res = await authorizedFetch(`${EVENTS_URL}/events/${eventId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await parseError(res))
}

export async function joinEvent(eventId: number): Promise<EventDetail> {
  const res = await authorizedFetch(`${EVENTS_URL}/events/${eventId}/join`, { method: 'POST' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EventDetail>
}

export type ChatListRow = {
  id: number
  kind: string
  event_id: number | null
  title: string
  subtitle: string
  avatar_url: string
  read_only: boolean
  last_preview?: string | null
  last_sender_profile_id?: number | null
  unread_count?: number
}

export type ChatMeta = {
  id: number
  kind: string
  event_id: number | null
  title: string
  subtitle: string
  avatar_url: string
  owner_profile_id?: number | null
  peer_profile_id?: number
  read_only: boolean
  notify_muted: boolean
  mute_until: string | null
  /** Личный чат: взаимная блокировка — отправка как на сервере. */
  dm_cannot_send?: boolean
  i_blocked_them?: boolean
  they_blocked_me?: boolean
  /** profile_id → last_read_message_id (другие участники; для отображения прочитано). */
  member_read_cursors?: Record<string, number>
}

export type DmEligibility = {
  can_message: boolean
  reason: string | null
  i_blocked_them: boolean
  they_blocked_me: boolean
  chat_exists: boolean
  chat_id: number | null
}

export type ChatAttachment = {
  url?: string
  kind?: string
  name?: string
  mime?: string
  [key: string]: unknown
}

export type ChatReplyPreview = {
  id: number
  sender_profile_id: number
  snippet: string
  has_voice?: boolean
  has_attachments?: boolean
}

export type ChatMessage = {
  id: number
  chat_id: number
  sender_profile_id: number
  is_system?: boolean
  body: string | null
  voice_path: string | null
  attachments: ChatAttachment[]
  reply_to_message_id?: number | null
  reply_preview?: ChatReplyPreview | null
  edited_at: string | null
  edited: boolean
  deleted_globally: boolean
  created_at: string | null
}

export function chatAssetAbsUrl(path: string): string {
  const p = path.trim()
  if (!p) return ''
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  const base = CHATS_URL.replace(/\/$/, '')
  return p.startsWith('/') ? `${base}${p}` : `${base}/${p}`
}

export function chatWebSocketUrl(chatId: number, accessToken: string): string {
  const base = CHATS_URL.replace(/\/$/, '')
  const wsBase = base.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://')
  return `${wsBase}/ws/chats/${chatId}?token=${encodeURIComponent(accessToken)}`
}

export function chatInboxWebSocketUrl(accessToken: string): string {
  const base = CHATS_URL.replace(/\/$/, '')
  const wsBase = base.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://')
  return `${wsBase}/ws/inbox?token=${encodeURIComponent(accessToken)}`
}

export function chatAvatarSrc(meta: { avatar_url?: string | null } | null | undefined): string {
  const path = meta?.avatar_url?.trim()
  if (!path) return '/default-avatar.svg'
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (
    path.startsWith('/profiles') ||
    path.startsWith('/uploads/profiles') ||
    path.startsWith('/media/avatars') ||
    path.startsWith('/media/profile-gallery')
  ) {
    return profileMediaAbsUrl(path)
  }
  if (path.startsWith('/events') || path.startsWith('/uploads/events')) {
    return eventMediaAbsUrl(path)
  }
  return chatAssetAbsUrl(path)
}

export async function fetchMyChats(): Promise<ChatListRow[]> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/me`, { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  const j = (await res.json()) as { chats?: ChatListRow[] }
  return j.chats ?? []
}

export async function fetchEventChatId(eventId: number): Promise<number> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/by-event/${eventId}`, { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  const j = (await res.json()) as { chat_id?: number }
  if (typeof j.chat_id !== 'number') throw new Error('Чат не найден')
  return j.chat_id
}

export async function fetchDmEligibility(peerProfileId: number): Promise<DmEligibility> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/dm/eligibility/${peerProfileId}`, { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<DmEligibility>
}

export async function openDmChat(peerProfileId: number): Promise<{ chat_id: number | null; created: boolean }> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/dm/open/${peerProfileId}`, { method: 'POST' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<{ chat_id: number | null; created: boolean }>
}

export async function sendDmFirstMessage(
  peerProfileId: number,
  payload: { body?: string; voice_path?: string; attachments_json?: string; reply_to_message_id?: number },
): Promise<{ chat_id: number; messages: ChatMessage[] }> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/dm/first-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peer_profile_id: peerProfileId, ...payload }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<{ chat_id: number; messages: ChatMessage[] }>
}

export async function blockDmProfile(profileId: number): Promise<Profile> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me/dm-blocks/${profileId}`, { method: 'POST' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function unblockDmProfile(profileId: number): Promise<Profile> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me/dm-blocks/${profileId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function fetchChatMeta(chatId: number): Promise<ChatMeta> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}`, { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<ChatMeta>
}

export async function fetchChatMessages(chatId: number, after = 0, limit = 80): Promise<ChatMessage[]> {
  const q = new URLSearchParams({ after: String(after), limit: String(limit) })
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/messages?${q}`, { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  const j = (await res.json()) as { messages?: ChatMessage[] }
  return j.messages ?? []
}

export async function sendChatMessage(
  chatId: number,
  payload: { body?: string; attachments_json?: string; voice_path?: string; reply_to_message_id?: number },
): Promise<ChatMessage[]> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await parseError(res))
  const j: unknown = await res.json()
  if (j && typeof j === 'object' && 'messages' in j && Array.isArray((j as { messages: unknown }).messages)) {
    return (j as { messages: ChatMessage[] }).messages
  }
  if (j && typeof j === 'object' && 'id' in j) {
    return [j as ChatMessage]
  }
  return []
}

export type ChatMemberRow = {
  profile_id: number
  mute_until: string | null
  role: string
}

export async function fetchChatMembers(chatId: number): Promise<ChatMemberRow[]> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/members`, { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  const j = (await res.json()) as { members?: ChatMemberRow[] }
  return j.members ?? []
}

export async function uploadChatFile(chatId: number, file: File): Promise<ChatAttachment> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/upload`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<ChatAttachment>
}

export async function uploadChatVoice(chatId: number, blob: Blob, filename = 'voice.webm'): Promise<string> {
  const fd = new FormData()
  fd.append('file', blob, filename)
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/upload-voice`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error(await parseError(res))
  const j = (await res.json()) as { voice_path?: string }
  if (!j.voice_path) throw new Error('Нет пути к файлу')
  return j.voice_path
}

export type MuteDuration = '1h' | '3h' | '8h' | '1d'

export async function muteChatMember(chatId: number, targetProfileId: number, duration: MuteDuration): Promise<void> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/members/${targetProfileId}/mute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration }),
  })
  if (!res.ok) throw new Error(await parseError(res))
}

export async function clearMyChatHistory(chatId: number): Promise<void> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/clear-my-history`, { method: 'POST' })
  if (!res.ok) throw new Error(await parseError(res))
}

export async function purgeAllChatMessages(chatId: number): Promise<void> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/purge-messages`, { method: 'POST' })
  if (!res.ok) throw new Error(await parseError(res))
}

export async function deleteChatForAll(chatId: number): Promise<void> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/delete-for-all`, { method: 'POST' })
  if (!res.ok) throw new Error(await parseError(res))
}

export async function editChatMessage(chatId: number, messageId: number, body: string): Promise<ChatMessage> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<ChatMessage>
}

export async function deleteChatMessage(chatId: number, messageId: number): Promise<void> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/messages/${messageId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await parseError(res))
}

export async function markChatRead(chatId: number, lastReadMessageId: number): Promise<void> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ last_read_message_id: lastReadMessageId }),
  })
  if (!res.ok) throw new Error(await parseError(res))
}

export async function setChatNotifyMuted(chatId: number, muted: boolean): Promise<void> {
  const res = await authorizedFetch(`${CHATS_URL}/chats/${chatId}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ muted }),
  })
  if (!res.ok) throw new Error(await parseError(res))
}

export async function leaveEvent(eventId: number): Promise<EventDetail> {
  const res = await authorizedFetch(`${EVENTS_URL}/events/${eventId}/leave`, { method: 'POST' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EventDetail>
}

export async function completeEvent(eventId: number): Promise<EventDetail> {
  const res = await authorizedFetch(`${EVENTS_URL}/events/${eventId}/complete`, { method: 'POST' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EventDetail>
}

export async function removeEventParticipant(eventId: number, profileId: number): Promise<EventDetail> {
  const res = await authorizedFetch(`${EVENTS_URL}/events/${eventId}/participants/${profileId}/remove`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EventDetail>
}

export async function unblockEventParticipant(eventId: number, profileId: number): Promise<EventDetail> {
  const res = await authorizedFetch(`${EVENTS_URL}/events/${eventId}/participants/${profileId}/unblock`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EventDetail>
}

export async function uploadEventMedia(eventId: number, file: File): Promise<EventDetail> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await authorizedFetch(`${EVENTS_URL}/events/${eventId}/media`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EventDetail>
}

export async function deleteEventMediaItem(eventId: number, mediaId: string): Promise<EventDetail> {
  const res = await authorizedFetch(`${EVENTS_URL}/events/${eventId}/media/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: mediaId }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<EventDetail>
}

export type ProfileCompatScores = {
  personality_similarity: number
  interests_similarity: number
}

export async function fetchProfileCompat(otherProfileId: number): Promise<ProfileCompatScores> {
  const res = await authorizedFetch(`${MATCH_URL}/profile-compat/${otherProfileId}`, { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<ProfileCompatScores>
}

export async function loginRequest(email: string, password: string): Promise<TokenResponse> {
  return apiJsonPublic<TokenResponse>(`${AUTH_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function registerRequest(email: string, password: string): Promise<TokenResponse> {
  return apiJsonPublic<TokenResponse>(`${AUTH_URL}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function meRequest(): Promise<UserPublic> {
  const res = await authorizedFetch(`${AUTH_URL}/auth/me`, { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<UserPublic>
}

export async function changePassword(current_password: string, new_password: string): Promise<void> {
  const res = await authorizedFetch(`${AUTH_URL}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password, new_password }),
  })
  if (!res.ok) throw new Error(await parseError(res))
}

function normalizeCitySuggest(raw: unknown): RussianCity[] {
  if (!Array.isArray(raw)) return []
  const out: RussianCity[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim() : ''
    const lat = Number(o.lat)
    const lng = Number(o.lng)
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    out.push({ name, lat, lng })
  }
  return out
}

/** Подсказки городов и НП РФ через profiles-service → DaData (нужен DADATA_API_KEY на сервере). */
export async function fetchCitySuggest(q: string): Promise<RussianCity[]> {
  const t = q.trim()
  if (!t) return []
  const res = await authorizedFetch(
    `${PROFILES_URL}/geo/city-suggest?q=${encodeURIComponent(t)}`,
    { method: 'GET' },
  )
  if (!res.ok) throw new Error(await parseError(res))
  const j: unknown = await res.json()
  return normalizeCitySuggest(j)
}

export async function fetchProfileMe(): Promise<Profile | null> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me`, { method: 'GET' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function fetchProfilePublic(profileId: number): Promise<Profile | null> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/${profileId}`, { method: 'GET' })
  if (res.status === 404) return null
  if (!res.ok) return null
  const j: unknown = await res.json()
  if (!j || typeof j !== 'object' || ('error' in j && (j as { error?: string }).error)) return null
  return j as Profile
}

export async function createProfile(body: ProfileSaveBody): Promise<Profile> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function updateProfile(body: Partial<ProfileSaveBody>): Promise<Profile> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function submitShortQuestionnaire(answers: Record<string, number>): Promise<Profile> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me/questionnaire/short`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function submitLongQuestionnaire(answers: Record<string, number>): Promise<Profile> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me/questionnaire/long`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function resetPersonalityQuestionnaire(): Promise<Profile> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me/questionnaire/reset`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function uploadProfileAvatar(file: File): Promise<Profile> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me/avatar`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function deleteProfileAvatar(): Promise<Profile> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me/avatar`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function uploadProfileGallery(file: File): Promise<Profile> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me/gallery`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function deleteProfileGalleryItem(mediaId: string): Promise<Profile> {
  const res = await authorizedFetch(
    `${PROFILES_URL}/profiles/me/gallery/${encodeURIComponent(mediaId)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

export async function recommendEvents(
  searchRadius: RecommendSearchRadius = '25',
  categorySlugs?: string[],
  /** Центр поиска по расстоянию (не меняет профиль). Если не задан — координаты из анкеты. */
  searchCenter?: { lat: number; lng: number } | null,
): Promise<RecommendResponse> {
  const q = new URLSearchParams({ search_radius: searchRadius })
  const slugs = (categorySlugs ?? []).map((s) => s.trim()).filter(Boolean)
  if (slugs.length) q.set('categories', slugs.join(','))
  if (searchCenter != null && Number.isFinite(searchCenter.lat) && Number.isFinite(searchCenter.lng)) {
    q.set('search_lat', String(searchCenter.lat))
    q.set('search_lng', String(searchCenter.lng))
  }
  const res = await authorizedFetch(`${MATCH_URL}/recommend-events?${q}`, { method: 'GET' })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<RecommendResponse>
}

export async function fetchInterestsCatalog(): Promise<InterestCatalogItem[]> {
  const res = await fetch(`${PROFILES_URL}/interests`)
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<InterestCatalogItem[]>
}

export async function putProfileInterests(interestIds: number[]): Promise<Profile> {
  const res = await authorizedFetch(`${PROFILES_URL}/profiles/me/interests`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interest_ids: interestIds }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<Profile>
}

async function apiJsonPublic<T>(url: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) throw new Error(await parseError(res))
  return res.json() as Promise<T>
}
