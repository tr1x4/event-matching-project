import { Bars3Icon, FunnelIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../components/EventMediaGallery.css'
import './FormPage.css'
import {
  recommendEvents,
  type RecommendResponse,
  type RecommendSearchRadius,
  userFacingRequestError,
} from '../api/client'
import { EventFeedCard, type EventFeedCardModel } from '../components/EventFeedCard'
import { HomeCityRadiusModal } from '../components/HomeCityRadiusModal'
import { RecCategoryFilterModal } from '../components/RecCategoryFilterModal'
import { useOnboarding } from '../context/OnboardingContext'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { eventCategoryLabel } from '../data/eventCategories'
import type { RussianCity } from '../data/russianCities'
import { displayCityName } from '../utils/profileUi'

const HOME_REC_FILTERS_KEY = 'eventmatch_home_rec_filters_v2'

/** Критерий + направление: asc/desc зависят от смысла поля (см. подписи в меню). */
type HomeSortPreset =
  | 'match_desc'
  | 'match_asc'
  | 'distance_asc'
  | 'distance_desc'
  | 'date_asc'
  | 'date_desc'

const SORT_PRESET_OPTIONS: { id: HomeSortPreset; label: string }[] = [
  { id: 'match_desc', label: 'По совпадению: сначала сильнее (характер и интересы)' },
  { id: 'match_asc', label: 'По совпадению: сначала слабее' },
  { id: 'distance_asc', label: 'По расстоянию: сначала ближе' },
  { id: 'distance_desc', label: 'По расстоянию: сначала дальше' },
  { id: 'date_asc', label: 'По дате события: сначала раньше' },
  { id: 'date_desc', label: 'По дате события: сначала позже' },
]

function isHomeSortPreset(x: string): x is HomeSortPreset {
  return (
    x === 'match_desc' ||
    x === 'match_asc' ||
    x === 'distance_asc' ||
    x === 'distance_desc' ||
    x === 'date_asc' ||
    x === 'date_desc'
  )
}

function migrateLegacySortMode(sortMode: string): HomeSortPreset {
  if (sortMode === 'match') return 'match_desc'
  if (sortMode === 'distance') return 'distance_asc'
  if (sortMode === 'date') return 'date_asc'
  return 'match_desc'
}

function loadHomeRecFilters(): {
  searchRadius: RecommendSearchRadius
  categorySlugs: string[]
  searchCityOverride: RussianCity | null
  sortPreset: HomeSortPreset
} {
  if (typeof sessionStorage === 'undefined') {
    return { searchRadius: '25', categorySlugs: [], searchCityOverride: null, sortPreset: 'match_desc' }
  }
  try {
    const raw = sessionStorage.getItem(HOME_REC_FILTERS_KEY)
    if (!raw) {
      const legacy = sessionStorage.getItem('eventmatch_home_rec_filters_v1')
      if (legacy) {
        const j1 = JSON.parse(legacy) as Record<string, unknown>
        const sm = typeof j1.sortMode === 'string' ? j1.sortMode : 'smart'
        return {
          searchRadius: (typeof j1.searchRadius === 'string' ? j1.searchRadius : '25') as RecommendSearchRadius,
          categorySlugs: Array.isArray(j1.categorySlugs)
            ? (j1.categorySlugs as unknown[]).filter((x): x is string => typeof x === 'string')
            : [],
          searchCityOverride: (() => {
            const o = j1.searchCityOverride
            if (o && typeof o === 'object') {
              const r = o as Record<string, unknown>
              if (typeof r.name === 'string' && typeof r.lat === 'number' && typeof r.lng === 'number') {
                return { name: r.name, lat: r.lat, lng: r.lng }
              }
            }
            return null
          })(),
          sortPreset: migrateLegacySortMode(sm),
        }
      }
      return { searchRadius: '25', categorySlugs: [], searchCityOverride: null, sortPreset: 'match_desc' }
    }
    const j = JSON.parse(raw) as Record<string, unknown>
    const sr = (typeof j.searchRadius === 'string' ? j.searchRadius : '25') as RecommendSearchRadius
    const cats = Array.isArray(j.categorySlugs)
      ? (j.categorySlugs as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
    const spRaw = typeof j.sortPreset === 'string' ? j.sortPreset : ''
    const sortPreset: HomeSortPreset = isHomeSortPreset(spRaw) ? spRaw : migrateLegacySortMode(String(j.sortMode ?? 'smart'))
    let searchCityOverride: RussianCity | null = null
    const o = j.searchCityOverride
    if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>
      if (typeof r.name === 'string' && typeof r.lat === 'number' && typeof r.lng === 'number') {
        searchCityOverride = { name: r.name, lat: r.lat, lng: r.lng }
      }
    }
    return { searchRadius: sr, categorySlugs: cats, searchCityOverride, sortPreset }
  } catch {
    return { searchRadius: '25', categorySlugs: [], searchCityOverride: null, sortPreset: 'match_desc' }
  }
}

function sortPresetLabel(preset: HomeSortPreset): string {
  return SORT_PRESET_OPTIONS.find((o) => o.id === preset)?.label ?? preset
}

function toFeedModel(r: RecommendResponse['recommendations'][number]): EventFeedCardModel {
  return {
    event_id: r.event_id,
    title: r.title,
    description: r.description,
    media: r.media,
    starts_at: r.starts_at,
    duration_key: r.duration_key,
    participant_bucket: r.participant_bucket,
    status: r.status,
    category_slugs: r.category_slugs,
    category_interest_slug: r.category_interest_slug,
    participants: r.participants,
    creator_profile_id: r.creator_profile_id,
    match_score: r.match_score,
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    distance_km: r.distance_km ?? undefined,
  }
}

function sortRecommendations(
  list: RecommendResponse['recommendations'],
  preset: HomeSortPreset,
): RecommendResponse['recommendations'] {
  const copy = [...list]
  const matchVal = (r: (typeof copy)[number]) => Number(r.match_score ?? 0)
  const distVal = (r: (typeof copy)[number]) =>
    r.distance_km != null && Number.isFinite(Number(r.distance_km)) ? Number(r.distance_km) : 1e12
  const dateVal = (r: (typeof copy)[number]) => {
    if (!r.starts_at) return 1e15
    const t = new Date(r.starts_at).getTime()
    return Number.isFinite(t) ? t : 1e15
  }

  const [key, dir] = preset.split('_') as ['match' | 'distance' | 'date', 'asc' | 'desc']

  copy.sort((a, b) => {
    if (key === 'match') {
      const va = matchVal(a)
      const vb = matchVal(b)
      return dir === 'desc' ? vb - va : va - vb
    }
    if (key === 'distance') {
      const da = distVal(a)
      const db = distVal(b)
      return dir === 'asc' ? da - db : db - da
    }
    const ta = dateVal(a)
    const tb = dateVal(b)
    return dir === 'asc' ? ta - tb : tb - ta
  })
  return copy
}

export function HomePage() {
  const { token } = useAuth()
  const { profile, isReady, loading: profLoading, mustFinishProfile } = useProfile()
  const { openInterestsModal } = useOnboarding()
  const navigate = useNavigate()
  const [data, setData] = useState<RecommendResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const storedFilters = loadHomeRecFilters()
  const [searchRadius, setSearchRadius] = useState<RecommendSearchRadius>(storedFilters.searchRadius)
  const [categorySlugs, setCategorySlugs] = useState<string[]>(storedFilters.categorySlugs)
  const [sortPreset, setSortPreset] = useState<HomeSortPreset>(storedFilters.sortPreset)
  const [cityModal, setCityModal] = useState(false)
  const [catModal, setCatModal] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement | null>(null)

  /** Точка на карте только для рекомендаций; null = координаты из анкеты. */
  const [searchCityOverride, setSearchCityOverride] = useState<RussianCity | null>(storedFilters.searchCityOverride)
  const prevProfileCityKey = useRef<string | null>(null)

  const catKey = useMemo(() => [...categorySlugs].sort().join(','), [categorySlugs])

  const searchCenter = useMemo(() => {
    if (!searchCityOverride) return null
    const { lat, lng } = searchCityOverride
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }, [searchCityOverride])

  const searchCenterKey = useMemo(() => {
    if (!searchCenter) return ''
    return `${searchCenter.lat.toFixed(5)},${searchCenter.lng.toFixed(5)}`
  }, [searchCenter])

  useEffect(() => {
    if (!sortMenuOpen) return
    function onDocMouseDown(ev: MouseEvent) {
      const el = sortMenuRef.current
      if (!el || el.contains(ev.target as Node)) return
      setSortMenuOpen(false)
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setSortMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [sortMenuOpen])

  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    if (profLoading || !isReady) {
      setListBusy(false)
      setData(null)
      return
    }

    let cancelled = false
    ;(async () => {
      setListBusy(true)
      setError(null)
      try {
        const rec = await recommendEvents(
          searchRadius,
          categorySlugs.length ? categorySlugs : undefined,
          searchCenter,
        )
        if (!cancelled) setData(rec)
      } catch (e) {
        if (!cancelled) setError(userFacingRequestError(e))
      } finally {
        if (!cancelled) setListBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, profLoading, isReady, navigate, searchRadius, catKey, searchCenterKey])

  const onJoined = useCallback(
    (eventId: number) => {
      setData((prev) => {
        if (!prev) return prev
        const pid = profile?.id
        return {
          ...prev,
          recommendations: prev.recommendations.map((row) =>
            row.event_id === eventId && pid != null
              ? {
                  ...row,
                  participants: Array.isArray(row.participants)
                    ? [...new Set([...row.participants, pid])]
                    : [pid],
                }
              : row,
          ),
        }
      })
    },
    [profile?.id],
  )

  const clearFilters = useCallback(() => {
    setSearchRadius('25')
    setCategorySlugs([])
    setSortPreset('match_desc')
    setSearchCityOverride(null)
    try {
      sessionStorage.removeItem(HOME_REC_FILTERS_KEY)
      sessionStorage.removeItem('eventmatch_home_rec_filters_v1')
    } catch {
      /* noop */
    }
  }, [])

  useEffect(() => {
    if (!token || profLoading || !isReady || mustFinishProfile) return
    try {
      sessionStorage.setItem(
        HOME_REC_FILTERS_KEY,
        JSON.stringify({ searchRadius, categorySlugs, searchCityOverride, sortPreset }),
      )
    } catch {
      /* noop */
    }
  }, [token, profLoading, isReady, mustFinishProfile, searchRadius, categorySlugs, searchCityOverride, sortPreset])

  useEffect(() => {
    if (!profile) return
    const key = `${profile.city_name ?? ''}|${profile.latitude ?? ''}|${profile.longitude ?? ''}`
    if (prevProfileCityKey.current !== null && prevProfileCityKey.current !== key) {
      clearFilters()
    }
    prevProfileCityKey.current = key
  }, [profile?.city_name, profile?.latitude, profile?.longitude, profile, clearFilters])

  const removeCat = useCallback((slug: string) => {
    setCategorySlugs((prev) => prev.filter((s) => s !== slug))
  }, [])

  const items = useMemo(() => {
    const raw = data?.recommendations ?? []
    const filtered = raw.filter((r) => (r.match_score ?? 0) >= 0.5)
    return sortRecommendations(filtered, sortPreset)
  }, [data?.recommendations, sortPreset])

  const interestCount = profile?.selected_interests?.length ?? 0
  const showInterestNudge = isReady && interestCount === 0

  const cityLabel = searchCityOverride?.name
    ? searchCityOverride.name
    : profile?.city_name
      ? displayCityName(profile.city_name)
      : 'Город для подбора'

  if (!token) return null

  if (profLoading) {
    return (
      <div className="card">
        <p className="muted">Проверка профиля…</p>
      </div>
    )
  }

  if (mustFinishProfile) {
    return (
      <div className="card wide">
        <div className="home-hero home-hero--centered">
          <img src="/logo.svg" alt="" className="home-hero-logo" width={56} height={56} />
          <div className="home-hero-text">
            <h1>Event match</h1>
            <p className="muted">Заполните анкету — откроются рекомендации</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card wide">
      <div className="home-hero home-hero--split">
        <div className="home-hero home-hero--centered home-hero--grow">
          <img src="/logo.svg" alt="" className="home-hero-logo" width={56} height={56} />
          <div className="home-hero-text">
            <h1>Рекомендации событий</h1>
            <p className="muted">С учётом вашего профиля</p>
          </div>
        </div>
      </div>

      {showInterestNudge ? (
        <div className="interest-nudge">
          <p>Добавьте интересы — подбор станет точнее</p>
          <button type="button" className="btn primary" onClick={() => openInterestsModal('picker')}>
            Указать интересы
          </button>
        </div>
      ) : null}

      <div className="home-filter-bar">
        <button
          type="button"
          className="home-filter-bar__city"
          onClick={() => setCityModal(true)}
          title={
            searchCityOverride
              ? 'Точка для поиска по карте. Анкета не меняется — сброс фильтров вернёт город из профиля.'
              : 'Задать точку для подбора (не меняет анкету)'
          }
        >
          {cityLabel}
        </button>
        <div className="home-filter-bar__filters-right">
          <label className="home-filter-bar__radius">
            <span className="home-filter-bar__radius-label">Радиус</span>
            <select
              className="field-input home-filter-bar__select"
              value={searchRadius}
              onChange={(e) => setSearchRadius(e.target.value as RecommendSearchRadius)}
              title="Режим «Вся Россия» снимает ограничение по расстоянию"
            >
              <option value="5">5 км</option>
              <option value="10">10 км</option>
              <option value="25">25 км</option>
              <option value="50">50 км</option>
              <option value="100">100 км</option>
              <option value="russia" title="Режим «Вся Россия» снимает ограничение по расстоянию">
                Вся Россия
              </option>
            </select>
          </label>
          <div className="home-filter-bar__sort" ref={sortMenuRef}>
            <button
              type="button"
              className="btn iconish home-filter-bar__sort-trigger"
              aria-expanded={sortMenuOpen}
              aria-haspopup="listbox"
              aria-label={`Сортировка: ${sortPresetLabel(sortPreset)}`}
              title={sortPresetLabel(sortPreset)}
              onClick={() => setSortMenuOpen((o) => !o)}
            >
              <Bars3Icon width={22} height={22} />
            </button>
            {sortMenuOpen ? (
              <ul className="home-sort-menu" role="listbox" aria-label="Сортировка списка">
                {SORT_PRESET_OPTIONS.map((opt) => (
                  <li key={opt.id} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={sortPreset === opt.id}
                      className={`home-sort-menu__opt${sortPreset === opt.id ? ' home-sort-menu__opt--on' : ''}`}
                      onClick={() => {
                        setSortPreset(opt.id)
                        setSortMenuOpen(false)
                      }}
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="btn iconish home-filter-bar__add-cat"
          aria-label="Категории событий"
          title="Категории"
          onClick={() => setCatModal(true)}
        >
          <FunnelIcon width={22} height={22} />
        </button>
        <button
          type="button"
          className="btn iconish home-filter-bar__trash"
          aria-label="Сбросить фильтры"
          title="Сбросить фильтры"
          onClick={clearFilters}
        >
          <TrashIcon width={22} height={22} />
        </button>
      </div>

      <div className="home-filter-chips">
        {categorySlugs.length === 0 ? (
          <span className="home-filter-chip home-filter-chip--all" aria-current="true">
            Все категории
          </span>
        ) : (
          categorySlugs.map((slug) => (
            <span key={slug} className="home-filter-chip">
              <span className="home-filter-chip__text">{eventCategoryLabel(slug)}</span>
              <button
                type="button"
                className="home-filter-chip__x"
                aria-label={`Убрать «${eventCategoryLabel(slug)}»`}
                onClick={() => removeCat(slug)}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      {profile ? (
        <HomeCityRadiusModal
          open={cityModal}
          profile={profile}
          searchOverride={searchCityOverride}
          onClose={() => setCityModal(false)}
          onApply={(city) => setSearchCityOverride(city)}
          onUseProfileCity={() => setSearchCityOverride(null)}
        />
      ) : null}
      <RecCategoryFilterModal
        open={catModal}
        initialSlugs={categorySlugs}
        onClose={() => setCatModal(false)}
        onApply={(slugs) => setCategorySlugs(slugs)}
      />

      {error ? (
        <p className="error" style={{ marginTop: '0.75rem' }}>
          {error}
        </p>
      ) : null}

      {listBusy ? <p className="muted home-list-status">Загружаем подбор…</p> : null}

      {!listBusy && !error && items.length === 0 ? (
        <div className="home-empty-block">
          <p className="home-empty-title">Событий не найдено</p>
          <p className="home-empty-hint">Создайте своё событие или настройте фильтры</p>
        </div>
      ) : null}

      {!listBusy && items.length > 0 ? (
        <div className="event-rec-list">
          {items.map((r) => (
            <EventFeedCard
              key={r.event_id}
              model={toFeedModel(r)}
              profileId={profile?.id}
              onJoined={onJoined}
              variant="recommendations"
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
