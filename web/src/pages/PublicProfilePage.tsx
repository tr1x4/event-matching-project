import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  blockDmProfile,
  fetchDmEligibility,
  fetchProfileCompat,
  fetchProfilePublic,
  profileAvatarSrc,
  profileMediaAbsUrl,
  unblockDmProfile,
  userFacingRequestError,
  type DmEligibility,
  type Profile,
  type ProfileCompatScores,
} from '../api/client'
import { EventMediaGallery } from '../components/EventMediaGallery'
import { InterestHeroIcon } from '../components/InterestHeroIcon'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { ageFromBirthDate, ageWordRu, displayCityName, genderLetterRu } from '../utils/profileUi'
import '../components/EventMediaGallery.css'
import './FormPage.css'
import './ProfilePage.css'

export function PublicProfilePage() {
  const { profileId } = useParams()
  const id = Number.parseInt(profileId ?? '', 10)
  const { token } = useAuth()
  const { profile: myProfile, refreshProfile } = useProfile()
  const navigate = useNavigate()
  const [p, setP] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [compat, setCompat] = useState<ProfileCompatScores | null>(null)
  const [compatErr, setCompatErr] = useState<string | null>(null)
  const [dmGate, setDmGate] = useState<DmEligibility | null>(null)
  const [dmBusy, setDmBusy] = useState(false)
  const [dmErr, setDmErr] = useState<string | null>(null)

  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (!Number.isFinite(id)) {
      setP(null)
      setLoading(false)
      return
    }
    let c = false
    ;(async () => {
      setLoading(true)
      try {
        const pr = await fetchProfilePublic(id)
        if (!c) setP(pr)
      } finally {
        if (!c) setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [id])

  useEffect(() => {
    if (!p || !myProfile?.id || myProfile.id === id) {
      setCompat(null)
      setCompatErr(null)
      return
    }
    let c = false
    setCompatErr(null)
    ;(async () => {
      try {
        const sc = await fetchProfileCompat(id)
        if (!c) setCompat(sc)
      } catch (e) {
        if (!c) setCompatErr(userFacingRequestError(e))
        if (!c) setCompat(null)
      }
    })()
    return () => {
      c = true
    }
  }, [p, myProfile?.id, id])

  const reloadDmGate = useCallback(async () => {
    if (!p || !myProfile?.id || myProfile.id === id || !Number.isFinite(id)) {
      setDmGate(null)
      return
    }
    try {
      setDmGate(await fetchDmEligibility(id))
    } catch {
      setDmGate(null)
    }
  }, [p, myProfile?.id, id])

  useEffect(() => {
    void reloadDmGate()
  }, [reloadDmGate])

  useEffect(() => {
    if (myProfile?.id != null && myProfile.id === id) {
      navigate('/profile', { replace: true })
    }
  }, [myProfile?.id, id, navigate])

  if (!token) return null

  if (loading) {
    return (
      <div className="card wide">
        <p className="muted">Загрузка профиля…</p>
      </div>
    )
  }

  if (!p) {
    return (
      <div className="card wide">
        <p className="error">Профиль не найден</p>
        <Link to="/" className="btn ghost">
          На главную
        </Link>
      </div>
    )
  }

  const name = p.name?.trim() || 'Без имени'
  const age = ageFromBirthDate(p.birth_date)
  const head = age != null ? `${name}, ${age} ${ageWordRu(age)}` : name
  const city = p.city_name ? displayCityName(p.city_name) : null
  const bio = (p.bio ?? '').trim()
  const selected = p.selected_interests ?? []
  const galleryItems = p.gallery ?? []
  const isSelf = myProfile?.id === id
  const iBlockedThem = Boolean(myProfile?.dm_blocked_profile_ids?.includes(id))
  const showWriteBtn = !isSelf && Boolean(dmGate?.can_message)
  const intPct = compat != null ? (compat.interests_similarity * 100).toFixed(0) : null
  const charPct =
    compat != null && Number.isFinite(compat.personality_similarity)
      ? (compat.personality_similarity * 100).toFixed(1)
      : null
  const alpha =
    typeof myProfile?.match_personality_weight === 'number' && Number.isFinite(myProfile.match_personality_weight)
      ? myProfile.match_personality_weight
      : 0.7
  const beta =
    typeof myProfile?.match_interests_weight === 'number' && Number.isFinite(myProfile.match_interests_weight)
      ? myProfile.match_interests_weight
      : 0.3
  const combinedCompatPct =
    !isSelf && compat != null
      ? Math.round(100 * (alpha * compat.personality_similarity + beta * compat.interests_similarity))
      : null

  const onWrite = async () => {
    if (!dmGate?.can_message) return
    setDmErr(null)
    setDmBusy(true)
    try {
      if (dmGate.chat_id != null) {
        navigate(`/chats/${dmGate.chat_id}`)
        return
      }
      navigate(`/chats/compose/${id}`)
    } catch (e) {
      setDmErr(userFacingRequestError(e))
    } finally {
      setDmBusy(false)
    }
  }

  const onToggleBlock = async () => {
    setDmErr(null)
    setDmBusy(true)
    try {
      if (iBlockedThem) {
        await unblockDmProfile(id)
      } else {
        await blockDmProfile(id)
      }
      await refreshProfile({ quiet: true })
      await reloadDmGate()
    } catch (e) {
      setDmErr(userFacingRequestError(e))
    } finally {
      setDmBusy(false)
    }
  }

  return (
    <div className="card wide profile-page">
      <div className="page-hero-inline public-profile-hero">
        <Link to="/" className="btn ghost small">
          Назад
        </Link>
        {!isSelf ? (
          <div className="public-profile-actions">
            {showWriteBtn ? (
              <button type="button" className="btn primary small" disabled={dmBusy} onClick={() => void onWrite()}>
                {dmBusy ? 'Открытие' : 'Написать'}
              </button>
            ) : null}
            <button type="button" className="btn ghost small" disabled={dmBusy} onClick={() => void onToggleBlock()}>
              {iBlockedThem ? 'Разблокировать' : 'Заблокировать'}
            </button>
          </div>
        ) : null}
      </div>
      {dmErr ? (
        <p className="error" style={{ marginBottom: '0.75rem' }}>
          {dmErr}
        </p>
      ) : null}

      <section className="pp-card public-profile-identity-card">
        {!isSelf && combinedCompatPct != null ? (
          <div
            className="public-profile-compat-hero-pct"
            title="Совместимость с учётом ваших настроек весов (характер и интересы)"
          >
            <span className="public-profile-compat-hero-pct__value">{combinedCompatPct}</span>
            <span className="public-profile-compat-hero-pct__suffix">%</span>
          </div>
        ) : null}
        <div className="pp-identity-row">
          <img className="pp-avatar-lg" src={profileAvatarSrc(p)} width={112} height={112} alt="" />
          <div>
            <h1 className="pp-display-name">{head}</h1>
            <p className="pp-meta-line">
              {genderLetterRu(p.gender ?? null)}
              {city ? ` · ${city}` : ''}
            </p>
          </div>
        </div>
      </section>

      {galleryItems.length > 0 ? (
        <section className="pp-card">
          <h2 className="pp-section-title">Медиа</h2>
          <EventMediaGallery items={galleryItems} videoFirst={false} resolveMediaUrl={profileMediaAbsUrl} />
        </section>
      ) : null}

      {bio ? (
        <section className="pp-card">
          <h2 className="pp-section-title">О себе</h2>
          <p className="pp-bio-body">{bio}</p>
        </section>
      ) : null}

      <section className="pp-card">
        <div className="public-profile-interests-header">
          <h2 className="pp-section-title">Интересы</h2>
        </div>
        {selected.length > 0 ? (
          <div className="profile-interest-chips">
            {selected.map((it) => (
              <div key={it.id} className="profile-interest-chip">
                <span className="profile-interest-chip-icon" aria-hidden>
                  {it.slug ? <InterestHeroIcon slug={it.slug} className="profile-interest-chip-svg" /> : null}
                </span>
                <span>{it.label_ru}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Интересы не указаны</p>
        )}
      </section>

      <section className="pp-card public-profile-character-card">
        <h2 className="pp-section-title">Характер и интересы</h2>
        {isSelf ? (
          <p className="muted public-profile-character-lead">Так ваш профиль видят другие пользователи.</p>
        ) : compatErr ? (
          <p className="muted public-profile-character-lead">{compatErr}</p>
        ) : intPct != null && charPct != null ? (
          <p className="muted public-profile-character-lead public-profile-compat-breakdown">
            Сходство по чертам личности: <strong>{charPct}%</strong>
            <br />
            Сходство по интересам: <strong>{intPct}%</strong>
          </p>
        ) : (
          <p className="muted public-profile-character-lead">
            Заполните «Черты личности» в своём профиле — здесь появится оценка сходства.
          </p>
        )}
      </section>
    </div>
  )
}
