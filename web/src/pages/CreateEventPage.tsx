import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createEvent,
  uploadEventMedia,
  userFacingRequestError,
  type EventCreatePayload,
  type EventDurationKey,
  type ParticipantBucket,
} from '../api/client'
import { EventCategoryIcon } from '../components/EventCategoryIcon'
import { EventMediaGallery } from '../components/EventMediaGallery'
import { EventMediaPickerModal } from '../components/EventMediaPickerModal'
import { useLocalFileMediaItems } from '../hooks/useLocalFileMediaItems'
import { EventMapPicker, type MapLatLng } from '../components/EventMapPicker'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { EVENT_CATEGORIES } from '../data/eventCategories'
import { durationLabel, participantBucketLabel } from '../utils/eventUi'
import { MAX_EVENT_MEDIA_TOTAL, MAX_MEDIA_UPLOAD_BATCH } from '../utils/mediaFile'
import '../components/EventMediaGallery.css'
import '../components/InterestsModal.css'
import '../components/MediaPickModal.css'
import './FormPage.css'
import './ProfilePage.css'

const DURATION_OPTIONS: { value: EventDurationKey; label: string }[] = [
  { value: 'd1', label: durationLabel('d1') },
  { value: 'd2', label: durationLabel('d2') },
  { value: 'd3', label: durationLabel('d3') },
  { value: 'd4', label: durationLabel('d4') },
  { value: 'd5', label: durationLabel('d5') },
  { value: 'd6', label: durationLabel('d6') },
  { value: 'week', label: durationLabel('week') },
  { value: 'longer', label: durationLabel('longer') },
]

const BUCKET_OPTIONS: { value: ParticipantBucket; label: string }[] = [
  { value: 'p2', label: participantBucketLabel('p2') },
  { value: 'p3_4', label: participantBucketLabel('p3_4') },
  { value: 'p5_9', label: participantBucketLabel('p5_9') },
  { value: 'p10_plus', label: participantBucketLabel('p10_plus') },
]

function defaultStartsAtLocal(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localToUtcIso(local: string): string {
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) throw new Error('Некорректная дата')
  return d.toISOString()
}

export function CreateEventPage() {
  const { token } = useAuth()
  const { profile, loading: profLoading, mustFinishProfile, isReady } = useProfile()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startsLocal, setStartsLocal] = useState(defaultStartsAtLocal)
  const [durationKey, setDurationKey] = useState<EventDurationKey>('d1')
  const [participantBucket, setParticipantBucket] = useState<ParticipantBucket>('p3_4')
  const [categorySlugs, setCategorySlugs] = useState<Set<string>>(new Set())
  const [position, setPosition] = useState<MapLatLng | null>(null)
  const [mediaFiles, setMediaFiles] = useState<File[]>([])
  const [mediaModalOpen, setMediaModalOpen] = useState(false)
  const { items: createMediaItems, filterOutMediaId } = useLocalFileMediaItems(mediaFiles)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (!profLoading && mustFinishProfile) navigate('/', { replace: true })
  }, [profLoading, mustFinishProfile, navigate])

  const defaultMapCenter = useMemo((): MapLatLng => {
    const lat = profile?.latitude
    const lng = profile?.longitude
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng }
    }
    return { lat: 55.7558, lng: 37.6173 }
  }, [profile?.latitude, profile?.longitude])

  useEffect(() => {
    if (!isReady) return
    setPosition((prev) => {
      if (prev) return prev
      return { ...defaultMapCenter }
    })
  }, [isReady, defaultMapCenter])

  const sortedCats = useMemo(
    () => [...EVENT_CATEGORIES].sort((a, b) => a.label_ru.localeCompare(b.label_ru, 'ru')),
    [],
  )

  const toggleCat = (slug: string) => {
    setCategorySlugs((prev) => {
      const n = new Set(prev)
      if (n.has(slug)) n.delete(slug)
      else n.add(slug)
      return n
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!position) {
      setError('Укажите точку на карте')
      return
    }
    if (!title.trim()) {
      setError('Укажите название')
      return
    }
    const cats = [...categorySlugs]
    if (cats.length === 0) {
      setError('Выберите хотя бы одну категорию')
      return
    }
    let startsIso: string
    try {
      startsIso = localToUtcIso(startsLocal)
    } catch {
      setError('Проверьте дату и время начала')
      return
    }

    const body: EventCreatePayload = {
      title: title.trim(),
      description: description.trim(),
      latitude: position.lat,
      longitude: position.lng,
      category_slugs: cats,
      starts_at: startsIso,
      duration_key: durationKey,
      participant_bucket: participantBucket,
    }

    setBusy(true)
    try {
      const created = await createEvent(body)
      for (const f of mediaFiles) {
        await uploadEventMedia(created.id, f)
      }
      navigate('/my-events', { replace: true })
    } catch (err) {
      setError(userFacingRequestError(err))
    } finally {
      setBusy(false)
    }
  }

  if (!token) return null
  if (profLoading || !isReady || mustFinishProfile) {
    return (
      <div className="card">
        <p className="muted">Загрузка…</p>
      </div>
    )
  }

  return (
    <div className="card wide profile-page profile-edit">
      <div className="page-hero-inline page-hero-inline--spaced">
        <h1>Новое событие</h1>
      </div>
      <p className="muted pp-lead">Точку на карте можно поставить где угодно</p>

      <form className="form form-dating" onSubmit={onSubmit}>
        <section className="pp-card pp-card--event-title">
          <h2 className="pp-section-title">Название</h2>
          <input
            id="ev-title"
            className="field-input field-input--event-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            placeholder="Кратко о событии"
          />
        </section>

        <section className="pp-card">
          <h2 className="pp-section-title">Медиа</h2>
          <p className="profile-field-hint">
            По желанию — до {MAX_EVENT_MEDIA_TOTAL} файлов (фото или видео), каждый до 50 МБ; за один выбор в окне не
            более {MAX_MEDIA_UPLOAD_BATCH} файлов.
          </p>
          {createMediaItems.length ? (
            <div className="create-event-media-strip" style={{ marginBottom: '0.75rem' }}>
              <EventMediaGallery
                items={createMediaItems}
                resolveMediaUrl={(u) => u}
                onDeleteItem={(id) => setMediaFiles(filterOutMediaId(id))}
              />
            </div>
          ) : null}
          <button type="button" className="btn ghost" onClick={() => setMediaModalOpen(true)}>
            {mediaFiles.length ? 'Добавить или изменить медиа' : 'Добавить медиа'}
          </button>
        </section>

        <section className="pp-card">
          <h2 className="pp-section-title">Категории</h2>
          <p className="profile-field-hint">Можно выбрать несколько</p>
          <div className="create-event-categories-scroll">
            <div className="interest-grid interest-grid--compact">
              {sortedCats.map((it) => {
                const on = categorySlugs.has(it.slug)
                return (
                  <button
                    key={it.slug}
                    type="button"
                    className={`interest-card${on ? ' interest-card--on' : ''}`}
                    onClick={() => toggleCat(it.slug)}
                  >
                    <span className="interest-icon-wrap" aria-hidden>
                      <EventCategoryIcon slug={it.slug} />
                    </span>
                    <span className="interest-label">{it.label_ru}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="pp-card">
          <h2 className="pp-section-title">Дата и время</h2>
          <label className="field-label" htmlFor="ev-start">
            Начало
          </label>
          <input
            id="ev-start"
            className="field-input input-date-pretty"
            type="datetime-local"
            value={startsLocal}
            onChange={(e) => setStartsLocal(e.target.value)}
            required
          />
          <p className="profile-field-hint" style={{ marginTop: '0.75rem' }}>
            Длительность
          </p>
          <div className="event-bucket-row">
            {DURATION_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`btn${durationKey === o.value ? ' primary' : ' ghost'}`}
                onClick={() => setDurationKey(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section className="pp-card">
          <h2 className="pp-section-title">Участники</h2>
          <p className="profile-field-hint">На какое примерное количество человек рассчитано событие — не является ограничением для присоединения</p>
          <div className="event-bucket-row">
            {BUCKET_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`btn${participantBucket === o.value ? ' primary' : ' ghost'}`}
                onClick={() => setParticipantBucket(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section className="pp-card">
          <h2 className="pp-section-title">Место на карте</h2>
          <p className="profile-field-hint">Клик или перетаскивание маркера</p>
          {position ? <EventMapPicker position={position} onChange={setPosition} /> : null}
        </section>

        <section className="pp-card">
          <h2 className="pp-section-title">Описание</h2>
          <textarea
            id="ev-desc"
            className="field-input"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={8000}
          />
        </section>

        {error ? <p className="error">{error}</p> : null}

        <div className="wizard-actions" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn ghost" onClick={() => navigate(-1)} disabled={busy}>
            Отмена
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Создание' : 'Создать'}
          </button>
        </div>
      </form>

      <EventMediaPickerModal
        open={mediaModalOpen}
        onClose={() => setMediaModalOpen(false)}
        files={mediaFiles}
        onChangeFiles={setMediaFiles}
      />
    </div>
  )
}
