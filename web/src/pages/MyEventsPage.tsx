import { EllipsisHorizontalIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  completeEvent,
  deleteCompletedEvent,
  fetchMyEvents,
  patchEvent,
  type EventDetail,
  userFacingRequestError,
} from '../api/client'
import { ConfirmModal } from '../components/ConfirmModal'
import { EventCompleteConfirmModal } from '../components/EventCompleteConfirmModal'
import { EventFeedCard, type EventFeedCardModel, type EventFeedCardOwnerMenu } from '../components/EventFeedCard'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { eventPastExpectedDuration } from '../utils/eventDuration'
import './FormPage.css'
import './ProfilePage.css'

type TabKey = 'all' | 'mine'

function toFeedModel(e: EventDetail): EventFeedCardModel {
  return {
    event_id: e.id,
    title: e.title,
    description: e.description,
    media: e.media,
    starts_at: e.starts_at,
    duration_key: e.duration_key,
    participant_bucket: e.participant_bucket,
    status: e.status,
    category_slugs: e.category_slugs,
    category_interest_slug: e.category_interest_slug,
    participants: e.participants,
    creator_profile_id: e.creator_profile_id,
    latitude: e.latitude,
    longitude: e.longitude,
    hidden_from_discovery: e.hidden_from_discovery,
  }
}

function sortMineEvents(list: EventDetail[]): EventDetail[] {
  const rank = (s: string) => (s === 'active' ? 0 : s === 'planned' ? 1 : 2)
  return [...list].sort((a, b) => {
    const sa = String(a.status ?? '')
    const sb = String(b.status ?? '')
    const ra = rank(sa)
    const rb = rank(sb)
    if (ra !== rb) return ra - rb
    const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0
    const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0
    if (sa === 'planned' && sb === 'planned' && ta && tb && ta !== tb) return ta - tb
    return (b.id ?? 0) - (a.id ?? 0)
  })
}

function hintKey(): string {
  return `myEvHintDismissed:${new Date().toISOString().slice(0, 10)}`
}

export function MyEventsPage() {
  const { token } = useAuth()
  const { profile, loading: profLoading, mustFinishProfile } = useProfile()
  const navigate = useNavigate()
  const [items, setItems] = useState<EventDetail[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('all')
  const [showCompleted, setShowCompleted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [hintClosed, setHintClosed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(hintKey()) === '1',
  )
  const [cardBusyId, setCardBusyId] = useState<number | null>(null)
  const [completeForId, setCompleteForId] = useState<number | null>(null)
  const [deleteForId, setDeleteForId] = useState<number | null>(null)
  const [pageErr, setPageErr] = useState<string | null>(null)

  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (!profLoading && mustFinishProfile) navigate('/', { replace: true })
  }, [profLoading, mustFinishProfile, navigate])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchMyEvents()
      setItems(list)
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!token || profLoading || mustFinishProfile) return
    void load()
  }, [token, profLoading, mustFinishProfile, load])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const myPid = profile?.id ?? 0

  const dismissHint = useCallback(() => {
    try {
      localStorage.setItem(hintKey(), '1')
    } catch {
      /* ignore */
    }
    setHintClosed(true)
  }, [])

  const filtered = useMemo(() => {
    let list = items
    if (showCompleted) {
      list = list.filter((e) => String(e.status ?? '') === 'completed')
    } else {
      list = list.filter((e) => String(e.status ?? '') !== 'completed')
    }
    if (tab === 'mine') {
      list = list.filter((e) => Number(e.creator_profile_id) === myPid)
    }
    return sortMineEvents(list)
  }, [items, tab, myPid, showCompleted])

  const hintEvents = useMemo(() => {
    if (!myPid || hintClosed) return []
    return items.filter(
      (e) =>
        Number(e.creator_profile_id) === myPid &&
        String(e.status ?? '') === 'active' &&
        eventPastExpectedDuration(e.starts_at ?? null, String(e.duration_key ?? 'd1')),
    )
  }, [items, myPid, hintClosed])

  const deleteTarget = useMemo(
    () => (deleteForId != null ? items.find((x) => x.id === deleteForId) : undefined),
    [deleteForId, items],
  )

  const buildOwnerMenu = useCallback(
    (e: EventDetail): EventFeedCardOwnerMenu => ({
      hiddenFromDiscovery: Boolean(e.hidden_from_discovery),
      isCompleted: String(e.status ?? '') === 'completed',
      busy: cardBusyId === e.id,
      onToggleHidden: async () => {
        setPageErr(null)
        setCardBusyId(e.id)
        try {
          const next = !Boolean(e.hidden_from_discovery)
          await patchEvent(e.id, { hidden_from_discovery: next })
          await load()
        } catch (err) {
          setPageErr(userFacingRequestError(err))
        } finally {
          setCardBusyId(null)
        }
      },
      onComplete: () => setCompleteForId(e.id),
      onDeleteCompleted: () => setDeleteForId(e.id),
    }),
    [cardBusyId, load],
  )

  if (!token) return null
  if (profLoading || mustFinishProfile) {
    return (
      <div className="card">
        <p className="muted">Загрузка…</p>
      </div>
    )
  }

  return (
    <div className="card wide profile-page">
      <header className="my-events-top">
        <div className="my-events-tabs-wrap">
          <div className="my-events-pill-bar" role="tablist" aria-label="События">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'all'}
              className={`my-events-pill${tab === 'all' ? ' my-events-pill--on' : ''}`}
              onClick={() => setTab('all')}
            >
              Все
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'mine'}
              className={`my-events-pill${tab === 'mine' ? ' my-events-pill--on' : ''}`}
              onClick={() => setTab('mine')}
            >
              Созданные мной
            </button>
          </div>
          <Link to="/events/new" className="btn primary my-events-create">
            Создать событие
          </Link>
          <div className="my-events-top-actions">
            <div className="my-events-overflow">
              <button
                type="button"
                className="btn iconish"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label="Ещё"
                onMouseDown={(ev) => ev.stopPropagation()}
                onClick={(ev) => {
                  ev.stopPropagation()
                  setMenuOpen((v) => !v)
                }}
              >
                <EllipsisHorizontalIcon width={22} height={22} />
              </button>
              {menuOpen ? (
                <div className="my-events-overflow-menu" role="menu" onMouseDown={(ev) => ev.stopPropagation()}>
                  <button
                    type="button"
                    role="menuitem"
                    className="my-events-overflow-item"
                    onClick={() => {
                      setShowCompleted((v) => !v)
                      setMenuOpen(false)
                    }}
                  >
                    {showCompleted ? 'Скрыть завершенные' : 'Завершенные события'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {hintEvents.length > 0 && !showCompleted ? (
        <div className="my-events-hint">
          <button type="button" className="my-events-hint__close" aria-label="Закрыть" onClick={dismissHint}>
            <XMarkIcon width={18} height={18} />
          </button>
          <p className="my-events-hint__title">Пора отметить завершение?</p>
          <p className="my-events-hint__text">
            Если встреча уже не актуальна, завершите событие — участникам так проще ориентироваться
          </p>
          <ul className="my-events-hint__list">
            {hintEvents.map((e) => (
              <li key={e.id}>
                <span className="my-events-hint__name">{e.title?.trim() || `Событие #${e.id}`}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="muted pp-lead" style={{ marginTop: '0.35rem' }}>
        {showCompleted ? 'Завершённые события' : 'Активные и запланированные'}
      </p>

      {loading ? <p className="muted">Загружаем список…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {pageErr ? <p className="error">{pageErr}</p> : null}

      {!loading && !error && filtered.length === 0 ? (
        <div className="home-empty-block">
          <p className="home-empty-title">Нет событий</p>
          <p className="home-empty-hint">
            {showCompleted
              ? 'Пока нет завершённых — смените вкладку или отключите фильтр'
              : 'Создайте событие или загляните в рекомендации'}
          </p>
        </div>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div className="event-rec-list my-events-feed">
          {filtered.map((e) => {
            const isOwner = myPid > 0 && Number(e.creator_profile_id) === myPid
            return (
              <EventFeedCard
                key={e.id}
                model={toFeedModel(e)}
                profileId={profile?.id}
                showJoin={false}
                ownerMenu={isOwner ? buildOwnerMenu(e) : null}
              />
            )
          })}
        </div>
      ) : null}

      <EventCompleteConfirmModal
        open={completeForId != null}
        busy={cardBusyId != null}
        onClose={() => cardBusyId === null && setCompleteForId(null)}
        onConfirm={async () => {
          if (completeForId == null) return
          setPageErr(null)
          setCardBusyId(completeForId)
          try {
            await completeEvent(completeForId)
            setCompleteForId(null)
            await load()
          } catch (err) {
            setPageErr(userFacingRequestError(err))
          } finally {
            setCardBusyId(null)
          }
        }}
      />

      <ConfirmModal
        open={deleteForId != null}
        busy={cardBusyId != null}
        title="Удалить событие?"
        danger
        confirmLabel="Удалить для всех"
        cancelLabel="Отмена"
        onClose={() => cardBusyId === null && setDeleteForId(null)}
        onConfirm={async () => {
          if (deleteForId == null) return
          setPageErr(null)
          setCardBusyId(deleteForId)
          try {
            await deleteCompletedEvent(deleteForId)
            setDeleteForId(null)
            await load()
          } catch (err) {
            setPageErr(userFacingRequestError(err))
          } finally {
            setCardBusyId(null)
          }
        }}
      >
        <p style={{ margin: 0 }}>
          {deleteTarget?.title?.trim() ? (
            <>
              Событие «{deleteTarget.title.trim()}» и чат будут удалены у всех участников. Восстановить данные будет
              нельзя.
            </>
          ) : (
            <>Событие и чат будут удалены у всех участников. Восстановить данные будет нельзя.</>
          )}
        </p>
      </ConfirmModal>
    </div>
  )
}
