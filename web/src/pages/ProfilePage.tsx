import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { SparklesIcon } from '@heroicons/react/24/solid'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteProfileGalleryItem, profileAvatarSrc, profileMediaAbsUrl, type Profile } from '../api/client'
import { EventMediaGallery } from '../components/EventMediaGallery'
import { InterestHeroIcon } from '../components/InterestHeroIcon'
import { ProfileAvatarModal } from '../components/ProfileAvatarModal'
import { ProfileBioEditModal } from '../components/ProfileBioEditModal'
import { ProfileGalleryMediaModal } from '../components/ProfileGalleryMediaModal'
import { ProfileIdentityEditModal } from '../components/ProfileIdentityEditModal'
import { MatchWeightsModal } from '../components/MatchWeightsModal'
import { ProfilePersonalityEditModal } from '../components/ProfilePersonalityEditModal'
import { useOnboarding } from '../context/OnboardingContext'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { ageFromBirthDate, ageWordRu, displayCityName, genderLetterRu } from '../utils/profileUi'
import '../components/EventMediaGallery.css'
import './FormPage.css'
import './ProfilePage.css'

const traitLabels = [
  { key: 'openness', label: 'Открытость опыту' },
  { key: 'conscientiousness', label: 'Добросовестность' },
  { key: 'extraversion', label: 'Экстраверсия' },
  { key: 'agreeableness', label: 'Доброжелательность' },
  { key: 'neuroticism', label: 'Нейротизм' },
] as const

type ModalKey = 'avatar' | 'identity' | 'bio' | 'personality' | 'gallery' | 'matchWeights' | null

export function ProfilePage() {
  const { token } = useAuth()
  const { profile, loading: profLoading, mustFinishProfile, refreshProfile } = useProfile()
  const { openInterestsModal } = useOnboarding()
  const navigate = useNavigate()
  const [modal, setModal] = useState<ModalKey>(null)
  const [galleryErr, setGalleryErr] = useState<string | null>(null)

  const galleryItems = useMemo(() => profile?.gallery ?? [], [profile?.gallery])

  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (!profLoading && mustFinishProfile) navigate('/', { replace: true })
  }, [profLoading, mustFinishProfile, navigate])

  if (!token) return null
  if (profLoading || mustFinishProfile || !profile) {
    return (
      <div className="card">
        <p className="muted">Загрузка профиля…</p>
      </div>
    )
  }

  const p = profile as Profile
  const name = p.name?.trim() || 'Без имени'
  const age = ageFromBirthDate(p.birth_date)
  const nameWithAge = age != null ? `${name}, ${age} ${ageWordRu(age)}` : name
  const cityRaw = p.city_name?.trim()
  const cityLine = cityRaw ? displayCityName(cityRaw) : 'Город не указан'
  const bioText = (p.bio ?? '').trim()
  const selected = p.selected_interests ?? []
  const personality = Array.isArray(p.personality) && p.personality.length === 5 ? p.personality : null
  const mp = typeof p.match_personality_weight === 'number' ? p.match_personality_weight : 0.7
  const mi = typeof p.match_interests_weight === 'number' ? p.match_interests_weight : 0.3

  return (
    <div className="card wide profile-page">
      <div className="page-hero-inline">
        <h1>Мой профиль</h1>
      </div>
      <p className="muted pp-lead">Данные, которые видят другие пользователи при подборе.</p>

      <section className="pp-card pp-editable-hover">
        <div className="pp-identity-row">
          <button type="button" className="pp-avatar-btn" onClick={() => setModal('avatar')} aria-label="Изменить фото профиля">
            <img className="pp-avatar-lg" src={profileAvatarSrc(p)} width={112} height={112} alt="" />
          </button>
          <div className="pp-identity-text">
            <div className="pp-inline-head">
              <div>
                <h2 className="pp-display-name">{nameWithAge}</h2>
                <p className="pp-meta-line">
                  {genderLetterRu(p.gender ?? null)} · {cityLine}
                </p>
              </div>
              <button
                type="button"
                className="profile-inline-edit"
                aria-label="Редактировать имя и город"
                onClick={() => setModal('identity')}
              >
                <PencilSquareIcon width={22} height={22} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="pp-card">
        <h2 className="pp-section-title">Медиа</h2>
        {galleryItems.length > 0 ? (
          <EventMediaGallery
            items={galleryItems}
            videoFirst={false}
            resolveMediaUrl={profileMediaAbsUrl}
            onDeleteItem={async (id) => {
              setGalleryErr(null)
              await deleteProfileGalleryItem(id)
              await refreshProfile()
            }}
          />
        ) : (
          <p className="muted">Пока нет файлов.</p>
        )}
        {galleryErr ? <p className="error">{galleryErr}</p> : null}
        <p className="muted pp-gallery-actions">
          <button type="button" className="btn" onClick={() => setModal('gallery')}>
            Добавить медиа
          </button>
        </p>
      </section>

      <section className="pp-card pp-editable-hover">
        <div className="pp-inline-head">
          <h2 className="pp-section-title">О себе</h2>
          <button type="button" className="profile-inline-edit" aria-label="Редактировать описание" onClick={() => setModal('bio')}>
            <PencilSquareIcon width={22} height={22} />
          </button>
        </div>
        {bioText ? (
          <p className="pp-bio-body">{bioText}</p>
        ) : (
          <p className="muted pp-bio-placeholder">Текст не заполнен.</p>
        )}
      </section>

      <section className="pp-card pp-editable-hover">
        <div className="pp-inline-head">
          <h2 className="pp-section-title">Черты личности</h2>
          <button
            type="button"
            className="profile-inline-edit"
            aria-label="Анкета и черты личности"
            onClick={() => setModal('personality')}
          >
            <PencilSquareIcon width={22} height={22} />
          </button>
        </div>
        {personality ? (
          <div className="pp-traits-readonly">
            {traitLabels.map((t, i) => {
              const pct = Math.max(1, Math.min(100, Math.round(personality[i] * 100)))
              return (
                <div key={t.key} className="pp-trait-row">
                  <span className="pp-trait-label">{t.label}</span>
                  <div className="pp-trait-bar-wrap" aria-hidden>
                    <div className="pp-trait-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="pp-trait-val">{pct}%</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="muted">Пройдите короткую анкету в мастере или в разделе «Черты».</p>
        )}
      </section>

      <section className="pp-card pp-editable-hover">
        <div className="pp-inline-head">
          <h2 className="pp-section-title">Интересы</h2>
          {selected.length > 0 ? (
            <button
              type="button"
              className="profile-inline-edit"
              aria-label="Изменить интересы"
              onClick={() => openInterestsModal('picker')}
            >
              <PencilSquareIcon width={22} height={22} />
            </button>
          ) : null}
        </div>
        {selected.length === 0 ? (
          <div className="pp-interests-empty">
            <p className="muted">Интересы учитываются в рекомендациях.</p>
            <button type="button" className="btn profile-interests-cta" onClick={() => openInterestsModal('picker')}>
              <SparklesIcon className="profile-interests-cta-icon" aria-hidden />
              Указать интересы
            </button>
          </div>
        ) : (
          <div className="profile-interest-chips">
            {selected.map((it) => (
              <div key={it.id} className="profile-interest-chip">
                <span className="profile-interest-chip-icon" aria-hidden>
                  {it.slug ? (
                    <InterestHeroIcon slug={it.slug} className="profile-interest-chip-svg" />
                  ) : (
                    <span className="interest-icon-fallback">{it.icon}</span>
                  )}
                </span>
                <span>{it.label_ru}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="pp-card pp-editable-hover">
        <div className="pp-inline-head">
          <h2 className="pp-section-title">Подбор событий</h2>
          <button
            type="button"
            className="profile-inline-edit"
            aria-label="Настроить веса подбора"
            onClick={() => setModal('matchWeights')}
          >
            <PencilSquareIcon width={22} height={22} />
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.45 }}>
          Сейчас при оценке совпадения учитывается примерно <strong>{Math.round(mp * 100)}%</strong> сходства по чертам
          личности и <strong>{Math.round(mi * 100)}%</strong> — по общим интересам. Это влияет на рекомендации и
          отображаемый процент совпадения.
        </p>
      </section>

      <ProfileAvatarModal open={modal === 'avatar'} onClose={() => setModal(null)} profile={p} refreshProfile={refreshProfile} />
      <ProfileGalleryMediaModal
        open={modal === 'gallery'}
        onClose={() => setModal(null)}
        profile={p}
        refreshProfile={refreshProfile}
      />
      <ProfileIdentityEditModal open={modal === 'identity'} onClose={() => setModal(null)} profile={p} refreshProfile={refreshProfile} />
      <ProfileBioEditModal open={modal === 'bio'} onClose={() => setModal(null)} profile={p} refreshProfile={refreshProfile} />
      <ProfilePersonalityEditModal
        open={modal === 'personality'}
        onClose={() => setModal(null)}
        profile={p}
        refreshProfile={refreshProfile}
      />
      <MatchWeightsModal
        open={modal === 'matchWeights'}
        variant="picker"
        onClose={() => setModal(null)}
      />
    </div>
  )
}
