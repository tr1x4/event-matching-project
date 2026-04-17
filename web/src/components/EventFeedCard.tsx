import { CheckCircleIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ensureEventChat, fetchEventChatId, joinEvent, type EventMediaItem, userFacingRequestError } from '../api/client'
import { eventCategoryLabel } from '../data/eventCategories'
import { EventCategoryIcon } from './EventCategoryIcon'
import { EventMediaGallery } from './EventMediaGallery'
import {
  durationLabel,
  eventStatusLabel,
  formatEventDateTime,
  participantBucketApproxLine,
} from '../utils/eventUi'
import { reverseGeocodeAddressRu } from '../utils/reverseGeocode'
import './EventMediaGallery.css'

export type EventFeedCardModel = {
  event_id: number
  title?: string | null
  description?: string | null
  media?: EventMediaItem[]
  starts_at?: string | null
  duration_key?: string | null
  participant_bucket?: string | null
  status?: string | null
  category_slugs?: string[]
  category_interest_slug?: string | null
  participants?: number[]
  creator_profile_id?: number | null
  match_score?: number
  latitude?: number | null
  longitude?: number | null
  hidden_from_discovery?: boolean | null
  distance_km?: number | null
}

export type EventFeedCardOwnerMenu = {
  hiddenFromDiscovery?: boolean
  isCompleted: boolean
  busy?: boolean
  onToggleHidden: () => void
  onComplete: () => void
  onDeleteCompleted?: () => void
}

function categoryChipsFromModel(m: EventFeedCardModel): string[] {
  const raw = m.category_slugs
  if (Array.isArray(raw) && raw.length) return raw.filter(Boolean)
  const s = m.category_interest_slug
  return s ? [s] : []
}

type Props = {
  model: EventFeedCardModel
  profileId: number | null | undefined
  onJoined?: (eventId: number) => void
  showJoin?: boolean
  /** Карточка в ленте рекомендаций: крупный процент совпадения и подсказка. */
  variant?: 'default' | 'recommendations'
  ownerMenu?: EventFeedCardOwnerMenu | null
}

export function EventFeedCard({
  model,
  profileId,
  onJoined,
  showJoin = true,
  variant = 'default',
  ownerMenu = null,
}: Props) {
  const navigate = useNavigate()
  const r = model
  const pct = r.match_score != null ? (r.match_score * 100).toFixed(1) : null
  const media = r.media ?? []
  const cats = categoryChipsFromModel(r)
  const [joinBusy, setJoinBusy] = useState(false)
  const [joinErr, setJoinErr] = useState<string | null>(null)
  const [addrBusy, setAddrBusy] = useState(false)
  const [addrLine, setAddrLine] = useState<string | null>(null)
  const [chatBusy, setChatBusy] = useState(false)
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false)
  const ownerMenuRef = useRef<HTMLDivElement | null>(null)

  const la = r.latitude
  const lo = r.longitude
  const hasCoords = la != null && lo != null && Number.isFinite(la) && Number.isFinite(lo)

  useEffect(() => {
    if (!hasCoords) {
      setAddrBusy(false)
      setAddrLine(null)
      return
    }
    let cancelled = false
    setAddrBusy(true)
    void reverseGeocodeAddressRu(la, lo).then((t) => {
      if (cancelled) return
      setAddrBusy(false)
      setAddrLine(t)
    })
    return () => {
      cancelled = true
    }
  }, [hasCoords, la, lo])

  useEffect(() => {
    if (!ownerMenuOpen) return
    const close = (e: MouseEvent) => {
      const el = ownerMenuRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setOwnerMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ownerMenuOpen])

  const already =
    profileId != null && Array.isArray(r.participants) && r.participants.includes(profileId)
  const status = String(r.status ?? 'planned')
  const canJoin =
    showJoin &&
    profileId != null &&
    !already &&
    status === 'planned' &&
    r.creator_profile_id !== profileId

  const onJoin = useCallback(async () => {
    setJoinErr(null)
    setJoinBusy(true)
    try {
      const detail = await joinEvent(r.event_id)
      onJoined?.(r.event_id)
      let cid: number | null =
        typeof detail.event_chat_id === 'number' && detail.event_chat_id > 0 ? detail.event_chat_id : null
      if (cid == null) {
        try {
          const ens = await ensureEventChat(r.event_id)
          cid = ens.chat_id
        } catch {
          /* join уже прошёл — чат поднимется с сервера позже */
        }
      }
      if (cid != null && cid > 0) {
        navigate(`/chats/${cid}`)
      }
    } catch (e) {
      setJoinErr(userFacingRequestError(e))
    } finally {
      setJoinBusy(false)
    }
  }, [r.event_id, onJoined, navigate])

  const openEventChat = useCallback(async () => {
    setChatBusy(true)
    try {
      const ens = await ensureEventChat(r.event_id)
      navigate(`/chats/${ens.chat_id}`)
    } catch {
      try {
        const cid = await fetchEventChatId(r.event_id)
        navigate(`/chats/${cid}`)
      } catch (e) {
        setJoinErr(userFacingRequestError(e))
      }
    } finally {
      setChatBusy(false)
    }
  }, [r.event_id, navigate])

  const addressText = !hasCoords
    ? 'Адрес не указан'
    : addrBusy
      ? 'Загрузка адреса…'
      : addrLine?.trim()
        ? addrLine.trim()
        : 'Не удалось определить адрес по координатам'

  return (
    <article className="event-rec-card">
      <div className="event-rec-head">
        <Link to={`/events/${r.event_id}`} className="event-rec-title-link">
          <span className="event-rec-title">{r.title?.trim() || `Событие #${r.event_id}`}</span>
        </Link>
        <div
          className={
            variant === 'recommendations'
              ? 'event-rec-head-aside event-rec-head-aside--rec'
              : 'event-rec-head-aside event-rec-head-aside--compact'
          }
        >
          {variant === 'recommendations' && pct != null ? (
            <>
              <span className="event-rec-status-badge event-rec-status-badge--inline" title="Статус">
                {eventStatusLabel(status)}
              </span>
              <button type="button" className="event-rec-score-hit" aria-label={`Совпадение ${pct} процентов`}>
                <span className="event-rec-score-value">{pct}</span>
                <span className="event-rec-score-suffix">%</span>
              </button>
            </>
          ) : (
            <>
              <span className="event-rec-status-badge" title="Статус">
                {eventStatusLabel(status)}
              </span>
              {ownerMenu ? (
                <div className="event-rec-overflow" ref={ownerMenuRef}>
                  <button
                    type="button"
                    className="btn iconish event-rec-overflow-trigger"
                    aria-haspopup="true"
                    aria-expanded={ownerMenuOpen}
                    aria-label="Действия с событием"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setOwnerMenuOpen((v) => !v)
                    }}
                  >
                    <EllipsisHorizontalIcon width={20} height={20} />
                  </button>
                  {ownerMenuOpen ? (
                    <div className="event-rec-overflow-menu" role="menu" onMouseDown={(e) => e.stopPropagation()}>
                      {!ownerMenu.isCompleted ? (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            className="event-rec-overflow-item"
                            disabled={ownerMenu.busy}
                            onClick={() => {
                              setOwnerMenuOpen(false)
                              ownerMenu.onToggleHidden()
                            }}
                          >
                            {ownerMenu.hiddenFromDiscovery ? 'Показывать в рекомендациях' : 'Скрыть из рекомендаций'}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="event-rec-overflow-item event-rec-overflow-item--complete"
                            disabled={ownerMenu.busy}
                            onClick={() => {
                              setOwnerMenuOpen(false)
                              ownerMenu.onComplete()
                            }}
                          >
                            <CheckCircleIcon width={18} height={18} aria-hidden /> Завершить событие
                          </button>
                        </>
                      ) : null}
                      {ownerMenu.isCompleted && ownerMenu.onDeleteCompleted ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="event-rec-overflow-item event-rec-overflow-item--danger"
                          disabled={ownerMenu.busy}
                          onClick={() => {
                            setOwnerMenuOpen(false)
                            ownerMenu.onDeleteCompleted?.()
                          }}
                        >
                          Удалить событие
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      {media.length ? <EventMediaGallery items={media} /> : null}
      {r.description ? <p className="event-rec-desc">{r.description}</p> : null}
      <div className="event-rec-meta">
        {r.starts_at ? <span>{formatEventDateTime(r.starts_at)}</span> : null}
        {r.duration_key ? <span>{durationLabel(String(r.duration_key))}</span> : null}
        {r.participant_bucket ? <span>{participantBucketApproxLine(String(r.participant_bucket))}</span> : null}
      </div>
      <p className={`event-rec-address${hasCoords && !addrBusy && !addrLine?.trim() ? ' event-rec-address--warn' : ''} muted`}>
        {addressText}
      </p>
      {cats.length ? (
        <div className="event-rec-cats-scroll prm-scrollbar" aria-label="Категории">
          <div className="event-rec-cats-inner">
            {cats.map((slug) => (
              <div key={slug} className="event-rec-category">
                <span className="interest-icon-wrap event-rec-category-icon" aria-hidden>
                  <EventCategoryIcon slug={slug} />
                </span>
                <span className="event-rec-category-label">{eventCategoryLabel(slug)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {canJoin ? (
        <div className="event-rec-actions">
          <button type="button" className="btn primary" disabled={joinBusy} onClick={() => void onJoin()}>
            {joinBusy ? 'Отправка' : 'Присоединиться'}
          </button>
          {joinErr ? <p className="error event-rec-join-err">{joinErr}</p> : null}
        </div>
      ) : null}
      {already && profileId ? (
        <div className="event-rec-footer-chat">
          <button
            type="button"
            className="btn primary event-rec-chat-footer-btn"
            disabled={chatBusy}
            onClick={() => void openEventChat()}
          >
            {chatBusy ? 'Открытие' : 'Открыть чат'}
          </button>
          {joinErr && !canJoin ? <p className="error event-rec-join-err">{joinErr}</p> : null}
        </div>
      ) : null}
    </article>
  )
}
