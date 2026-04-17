import {
  CheckCircleIcon,
  EllipsisHorizontalIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  TrashIcon,
  UserMinusIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  completeEvent,
  deleteCompletedEvent,
  deleteEventMediaItem,
  ensureEventChat,
  fetchEvent,
  fetchEventChatId,
  fetchProfilePublic,
  joinEvent,
  leaveEvent,
  patchEvent,
  profileAvatarSrc,
  removeEventParticipant,
  uploadEventMedia,
  type EventDetail,
  type ParticipantBucket,
  type Profile,
  userFacingRequestError,
} from '../api/client'
import { ConfirmModal } from '../components/ConfirmModal'
import { EventBlockedListModal } from '../components/EventBlockedListModal'
import { EventCompleteConfirmModal } from '../components/EventCompleteConfirmModal'
import { EventDescriptionEditModal } from '../components/EventDescriptionEditModal'
import { EventMediaGallery } from '../components/EventMediaGallery'
import { EventMediaPickerModal } from '../components/EventMediaPickerModal'
import { EventCategoryIcon } from '../components/EventCategoryIcon'
import { EventMapPicker } from '../components/EventMapPicker'
import { eventCategoryLabel } from '../data/eventCategories'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import {
  durationLabel,
  eventStatusLabel,
  formatEventDateTime,
  participantBucketApproxLine,
} from '../utils/eventUi'
import { reverseGeocodeAddressRu } from '../utils/reverseGeocode'
import '../components/EventMediaGallery.css'
import '../components/MediaPickModal.css'
import './FormPage.css'
import './ProfilePage.css'

function memberIdsOrdered(ev: EventDetail): number[] {
  const creator = Number(ev.creator_profile_id)
  const parts = (ev.participants ?? []).map(Number)
  const out: number[] = []
  if (!out.includes(creator)) out.push(creator)
  for (const p of parts) {
    if (!out.includes(p)) out.push(p)
  }
  return out
}

export function EventDetailPage() {
  const { eventId } = useParams()
  const id = Number.parseInt(eventId ?? '', 10)
  const { token } = useAuth()
  const { profile, loading: profLoading, mustFinishProfile, refreshProfile } = useProfile()
  const navigate = useNavigate()

  const [ev, setEv] = useState<EventDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [profilesById, setProfilesById] = useState<Record<number, Profile | null>>({})
  const [mediaModal, setMediaModal] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<File[]>([])
  const [descModal, setDescModal] = useState(false)
  const [completeModal, setCompleteModal] = useState(false)
  const [blockedModal, setBlockedModal] = useState(false)
  const [placeAddress, setPlaceAddress] = useState<string | null>(null)
  const [bucketDraft, setBucketDraft] = useState<ParticipantBucket>('p3_4')
  const [deleteCompletedModal, setDeleteCompletedModal] = useState(false)
  const [headMenuOpen, setHeadMenuOpen] = useState(false)
  const headMenuRef = useRef<HTMLDivElement | null>(null)

  const reload = useCallback(async () => {
    if (!Number.isFinite(id)) return
    const e = await fetchEvent(id)
    setEv(e)
    if (e?.participant_bucket && ['p2', 'p3_4', 'p5_9', 'p10_plus'].includes(String(e.participant_bucket))) {
      setBucketDraft(e.participant_bucket as ParticipantBucket)
    }
  }, [id])

  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (!profLoading && mustFinishProfile) navigate('/', { replace: true })
  }, [profLoading, mustFinishProfile, navigate])

  useEffect(() => {
    if (!token || profLoading || mustFinishProfile || !Number.isFinite(id)) return
    let c = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const e = await fetchEvent(id)
        if (c) return
        if (!e) {
          setEv(null)
          setError('Событие не найдено')
        } else {
          setEv(e)
          if (e?.participant_bucket && ['p2', 'p3_4', 'p5_9', 'p10_plus'].includes(String(e.participant_bucket))) {
            setBucketDraft(e.participant_bucket as ParticipantBucket)
          }
        }
      } catch (e) {
        if (!c) setError(userFacingRequestError(e))
      } finally {
        if (!c) setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [token, profLoading, mustFinishProfile, id])

  useEffect(() => {
    if (!ev) {
      setPlaceAddress(null)
      return
    }
    let c = false
    void reverseGeocodeAddressRu(ev.latitude, ev.longitude).then((t) => {
      if (!c) setPlaceAddress(t)
    })
    return () => {
      c = true
    }
  }, [ev?.latitude, ev?.longitude, ev])

  const event = ev

  const membersKey = event ? memberIdsOrdered(event).join('-') : ''

  useEffect(() => {
    if (!event || !membersKey) return
    const ids = memberIdsOrdered(event)
    let cancelled = false
    setProfilesById({})
    ;(async () => {
      const next: Record<number, Profile | null> = {}
      for (const pid of ids) {
        try {
          const pr = await fetchProfilePublic(pid)
          if (!cancelled) next[pid] = pr
        } catch {
          if (!cancelled) next[pid] = null
        }
      }
      if (!cancelled) setProfilesById(next)
    })()
    return () => {
      cancelled = true
    }
  }, [event?.id, membersKey])

  useEffect(() => {
    if (!token || !Number.isFinite(id) || !ev) return
    const pid = profile?.id
    if (pid == null) return
    const cr = Number(ev.creator_profile_id)
    const parts = (ev.participants ?? []).map(Number)
    const isParticipant = pid === cr || parts.includes(pid)
    if (!isParticipant) return
    const t = window.setInterval(() => {
      void reload()
    }, 5000)
    return () => window.clearInterval(t)
  }, [token, id, ev, profile?.id, reload])

  useEffect(() => {
    if (!Number.isFinite(id)) return
    const onVis = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [id, reload])

  useEffect(() => {
    if (!headMenuOpen) return
    const close = (e: MouseEvent) => {
      const el = headMenuRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setHeadMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [headMenuOpen])

  if (!token) return null
  if (profLoading || mustFinishProfile) {
    return (
      <div className="card">
        <p className="muted">Загрузка…</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="card wide">
        <p className="muted">Загрузка события…</p>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="card wide">
        <p className="error">{error || 'Не найдено'}</p>
        <Link to="/my-events" className="btn ghost">
          К моим событиям
        </Link>
      </div>
    )
  }

  const myPid = profile?.id
  const isOwner = myPid != null && Number(event.creator_profile_id) === myPid
  const joined = myPid != null && (event.participants ?? []).map(Number).includes(myPid)
  const canJoin =
    !isOwner &&
    !joined &&
    String(event.status) === 'planned' &&
    !event.hidden_from_discovery

  const isCompleted = String(event.status) === 'completed'

  const catSlugs =
    event.category_slugs && event.category_slugs.length > 0
      ? event.category_slugs
      : event.category_interest_slug
        ? [event.category_interest_slug]
        : []

  const blocked = event.blocked_profile_ids ?? []
  const members = memberIdsOrdered(event)
  const listMemberCount = members.length
  const isMember = myPid != null && members.includes(myPid)
  const amBlocked = myPid != null && blocked.includes(myPid)

  const onToggleHidden = async () => {
    if (!isOwner || isCompleted) return
    setBusy(true)
    setError(null)
    try {
      const next = !Boolean(event.hidden_from_discovery)
      const updated = await patchEvent(event.id, { hidden_from_discovery: next })
      setEv(updated)
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setBusy(false)
    }
  }

  const onComplete = async () => {
    if (!isOwner) return
    setBusy(true)
    setError(null)
    try {
      const updated = await completeEvent(event.id)
      setEv(updated)
      setCompleteModal(false)
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setBusy(false)
    }
  }

  const onJoin = async () => {
    setBusy(true)
    setError(null)
    try {
      const updated = await joinEvent(event.id)
      setEv(updated)
      await refreshProfile()
      let cid: number | null =
        typeof updated.event_chat_id === 'number' && updated.event_chat_id > 0 ? updated.event_chat_id : null
      if (cid == null) {
        try {
          const ens = await ensureEventChat(event.id)
          cid = ens.chat_id
        } catch {
          /* остаёмся на странице события */
        }
      }
      if (cid != null && cid > 0) {
        navigate(`/chats/${cid}`)
      }
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setBusy(false)
    }
  }

  const openEventChat = async () => {
    if (!event) return
    setBusy(true)
    setError(null)
    try {
      const ensured = await ensureEventChat(event.id)
      const cid = ensured.chat_id
      navigate(`/chats/${cid}`)
    } catch (e) {
      try {
        const cid =
          typeof event.event_chat_id === 'number' && event.event_chat_id > 0
            ? event.event_chat_id
            : await fetchEventChatId(event.id)
        navigate(`/chats/${cid}`)
      } catch (e2) {
        setError(userFacingRequestError(e2 ?? e))
      }
    } finally {
      setBusy(false)
    }
  }

  const onSaveParticipantBucket = async () => {
    if (!isOwner || isCompleted || !event) return
    setBusy(true)
    setError(null)
    try {
      const u = await patchEvent(event.id, { participant_bucket: bucketDraft })
      setEv(u)
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setBusy(false)
    }
  }

  const onDeleteCompletedEventConfirm = async () => {
    if (!isOwner || !isCompleted || !event) return
    setBusy(true)
    setError(null)
    try {
      await deleteCompletedEvent(event.id)
      setDeleteCompletedModal(false)
      navigate('/my-events')
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setBusy(false)
    }
  }

  const onLeave = async () => {
    if (isOwner) return
    setBusy(true)
    setError(null)
    try {
      const updated = await leaveEvent(event.id)
      setEv(updated)
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setBusy(false)
    }
  }

  const onConfirmMediaUpload = async (files: File[]) => {
    for (const f of files) {
      await uploadEventMedia(event.id, f)
    }
    await reload()
  }

  const onDeleteMedia = async (mediaId: string) => {
    if (!isOwner || isCompleted) return
    setBusy(true)
    setError(null)
    try {
      const updated = await deleteEventMediaItem(event.id, mediaId)
      setEv(updated)
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setBusy(false)
    }
  }

  const onRemoveMember = async (profileId: number) => {
    if (!isOwner) return
    setBusy(true)
    setError(null)
    try {
      const updated = await removeEventParticipant(event.id, profileId)
      setEv(updated)
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setBusy(false)
    }
  }

  const pos = { lat: event.latitude, lng: event.longitude }

  const bucketOptions: ParticipantBucket[] = ['p2', 'p3_4', 'p5_9', 'p10_plus']

  return (
    <div className="card wide profile-page event-detail-page">
      <div className="event-detail-head">
        <div className="event-detail-title-block">
          <div className="event-detail-title-row">
            <h1 className="event-detail-title-h1">{event.title?.trim() || `Событие #${event.id}`}</h1>
            <div className="event-detail-title-actions">
              <span className="event-detail-status-pill" title="Статус события">
                {eventStatusLabel(String(event.status))}
              </span>
              {isOwner || (isMember && !amBlocked) ? (
                <div className="event-detail-head-overflow" ref={headMenuRef}>
                  <button
                    type="button"
                    className="btn iconish event-detail-overflow-trigger"
                    aria-haspopup="true"
                    aria-expanded={headMenuOpen}
                    aria-label="Меню действий"
                    disabled={busy}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setHeadMenuOpen((v) => !v)
                    }}
                  >
                    <EllipsisHorizontalIcon width={22} height={22} />
                  </button>
                  {headMenuOpen ? (
                    <div className="event-detail-overflow-menu" role="menu" onMouseDown={(e) => e.stopPropagation()}>
                      {isMember && !amBlocked ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="event-detail-overflow-item"
                          disabled={busy}
                          onClick={() => {
                            setHeadMenuOpen(false)
                            void openEventChat()
                          }}
                        >
                          Открыть чат
                        </button>
                      ) : null}
                      {isOwner && !isCompleted ? (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            className="event-detail-overflow-item"
                            disabled={busy}
                            onClick={() => {
                              setHeadMenuOpen(false)
                              void onToggleHidden()
                            }}
                          >
                            {event.hidden_from_discovery ? (
                              <>
                                <EyeIcon width={18} height={18} /> Показывать в рекомендациях
                              </>
                            ) : (
                              <>
                                <EyeSlashIcon width={18} height={18} /> Скрыть из рекомендаций
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="event-detail-overflow-item event-detail-overflow-item--complete"
                            disabled={busy}
                            onClick={() => {
                              setHeadMenuOpen(false)
                              setCompleteModal(true)
                            }}
                          >
                            <CheckCircleIcon width={18} height={18} /> Завершить событие
                          </button>
                        </>
                      ) : null}
                      {isOwner && isCompleted ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="event-detail-overflow-item event-detail-overflow-item--danger"
                          disabled={busy}
                          onClick={() => {
                            setHeadMenuOpen(false)
                            setDeleteCompletedModal(true)
                          }}
                        >
                          <TrashIcon width={18} height={18} /> Удалить событие
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="event-quick-cards" aria-label="Кратко о событии">
            <div className="event-quick-card">
              <span className="event-quick-card__k">Начало</span>
              <span className="event-quick-card__v">{event.starts_at ? formatEventDateTime(event.starts_at) : 'не задано'}</span>
            </div>
            <div className="event-quick-card">
              <span className="event-quick-card__k">Длительность</span>
              <span className="event-quick-card__v">{durationLabel(String(event.duration_key))}</span>
            </div>
            <div className="event-quick-card">
              <span className="event-quick-card__k">Участники</span>
              <span className="event-quick-card__v">{listMemberCount}</span>
            </div>
          </div>
        </div>
      </div>

      <section className="pp-card">
        <h2 className="pp-section-title">Медиа</h2>
        {event.media?.length ? (
          <EventMediaGallery
            items={event.media}
            onDeleteItem={isOwner && !isCompleted ? (mid) => onDeleteMedia(mid) : undefined}
          />
        ) : (
          <p className="muted">Пока без вложений</p>
        )}
        {isOwner && !isCompleted ? (
          <p className="pp-gallery-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setMediaModal(true)}>
              Добавить медиа
            </button>
          </p>
        ) : null}
      </section>

      {catSlugs.length ? (
        <section className="pp-card">
          <h2 className="pp-section-title">Категории</h2>
          <div className="profile-interest-chips" style={{ marginTop: '0.35rem' }}>
            {catSlugs.map((slug) => (
              <div key={slug} className="profile-interest-chip">
                <span className="profile-interest-chip-icon" aria-hidden>
                  <EventCategoryIcon slug={slug} className="profile-interest-chip-svg" />
                </span>
                <span>{eventCategoryLabel(slug)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pp-card pp-editable-hover">
        <div className="pp-inline-head">
          <h2 className="pp-section-title">Описание</h2>
          {isOwner && !isCompleted ? (
            <button
              type="button"
              className="profile-inline-edit"
              aria-label="Изменить описание"
              onClick={() => setDescModal(true)}
            >
              <PencilSquareIcon width={22} height={22} />
            </button>
          ) : null}
        </div>
        {event.description?.trim() ? (
          <p className="pp-bio-body">{event.description.trim()}</p>
        ) : (
          <p className="muted">Текст не добавлен.</p>
        )}
      </section>

      {isOwner && !isCompleted ? (
        <section className="pp-card">
          <h2 className="pp-section-title">Ожидаемый размер группы</h2>
          <p className="muted" style={{ marginTop: '0.25rem', fontSize: '0.88rem' }}>
            Приблизительное число участников. Изменение доступно, пока событие не завершено.
          </p>
          <div className="event-detail-bucket-pills" role="group" aria-label="Размер группы">
            {bucketOptions.map((b) => (
              <button
                key={b}
                type="button"
                className={`event-detail-bucket-pill${bucketDraft === b ? ' event-detail-bucket-pill--on' : ''}`}
                disabled={busy}
                onClick={() => setBucketDraft(b)}
              >
                {participantBucketApproxLine(b)}
              </button>
            ))}
          </div>
          <p style={{ marginTop: '0.65rem' }}>
            <button
              type="button"
              className="btn small"
              disabled={busy || String(event.participant_bucket) === bucketDraft}
              onClick={() => void onSaveParticipantBucket()}
            >
              Сохранить размер группы
            </button>
          </p>
        </section>
      ) : null}

      <section className="pp-card">
        <h2 className="pp-section-title">Место</h2>
        {placeAddress ? <p className="event-place-address">{placeAddress}</p> : null}
        <EventMapPicker position={pos} onChange={() => {}} readOnly />
      </section>

      <section className="pp-card">
        <div className="pp-inline-head event-participants-head">
          <h2 className="pp-section-title">Участники</h2>
          <div className="event-participants-count-wrap">
            <span className="event-participants-count" title="Участники в списке">
              {listMemberCount}
            </span>
            {isOwner && blocked.length > 0 ? (
              <button
                type="button"
                className="btn iconish event-blocked-trigger"
                aria-label="Исключённые из события"
                title="Исключённые из события"
                onClick={() => setBlockedModal(true)}
              >
                <UsersIcon width={22} height={22} />
                <span className="event-blocked-badge">{blocked.length}</span>
              </button>
            ) : null}
          </div>
        </div>
        <ul className="event-participant-list">
          {members.map((pid) => {
            const pr = profilesById[pid]
            const name = pr?.name?.trim() || `Профиль #${pid}`
            const isCreator = pid === Number(event.creator_profile_id)
            const st = String(event.status)
            const canKick = isOwner && !isCreator && !isCompleted && (st === 'planned' || st === 'active')
            return (
              <li key={pid} className="event-participant-row">
                <Link to={`/profiles/${pid}`} className="event-participant-main">
                  <img className="event-participant-avatar" src={profileAvatarSrc(pr)} width={44} height={44} alt="" />
                  <span className="event-participant-text">
                    <span className="event-participant-name">{name}</span>
                    {isCreator ? <span className="event-participant-role">организатор</span> : null}
                  </span>
                </Link>
                {canKick ? (
                  <button
                    type="button"
                    className="btn ghost small event-kick-btn"
                    disabled={busy}
                    title="Исключить из события"
                    onClick={() => void onRemoveMember(pid)}
                  >
                    <UserMinusIcon width={18} height={18} />
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      {!isOwner && canJoin ? (
        <section className="pp-card">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void onJoin()}>
            Присоединиться
          </button>
        </section>
      ) : null}

      {joined && !isOwner && !isCompleted ? (
        <section className="pp-card">
          <p className="muted" style={{ marginBottom: '0.65rem' }}>
            Вы в списке участников
          </p>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void onLeave()}>
            Покинуть событие
          </button>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <EventMediaPickerModal
        open={mediaModal}
        onClose={() => {
          setMediaModal(false)
          setPendingMedia([])
        }}
        files={pendingMedia}
        onChangeFiles={setPendingMedia}
        serverMedia={event.media ?? []}
        onConfirmUpload={onConfirmMediaUpload}
      />

      <EventDescriptionEditModal
        open={descModal}
        eventId={event.id}
        initialText={event.description ?? ''}
        onClose={() => setDescModal(false)}
        onSaved={reload}
      />

      <EventCompleteConfirmModal
        open={completeModal}
        busy={busy}
        onClose={() => setCompleteModal(false)}
        onConfirm={() => void onComplete()}
      />

      <EventBlockedListModal
        open={blockedModal}
        eventId={event.id}
        blockedIds={blocked}
        busy={busy}
        onClose={() => setBlockedModal(false)}
        onUnblocked={async () => {
          await reload()
        }}
      />

      <ConfirmModal
        open={deleteCompletedModal}
        busy={busy}
        title="Удалить событие?"
        danger
        confirmLabel="Удалить для всех"
        cancelLabel="Отмена"
        onClose={() => !busy && setDeleteCompletedModal(false)}
        onConfirm={() => void onDeleteCompletedEventConfirm()}
      >
        <p style={{ margin: 0 }}>
          Событие и чат будут удалены у всех участников. Восстановить данные будет нельзя.
        </p>
      </ConfirmModal>
    </div>
  )
}
