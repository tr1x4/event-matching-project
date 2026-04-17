import { type FormEvent, useEffect, useState } from 'react'
import {
  createProfile,
  profileAvatarSrc,
  submitShortQuestionnaire,
  updateProfile,
  uploadProfileAvatar,
  userFacingRequestError,
  type ProfileSaveBody,
} from '../api/client'
import { BigFiveLikertSurvey } from './BigFiveLikertSurvey'
import { FAST_QUESTIONS } from '../questionnaire/bfiQuestions'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useOnboarding } from '../context/OnboardingContext'
import { useProfile } from '../context/ProfileContext'
import type { RussianCity } from '../data/russianCities'
import { CityPicker } from './CityPicker'
import '../pages/FormPage.css'
import './ProfileWizardModal.css'

const MAX_AVATAR_BYTES = 3 * 1024 * 1024

const titles = ['О вас', 'Фото', 'Город', 'Черты личности'] as const

type FieldKey = 'name' | 'gender' | 'birth' | 'city' | 'avatar' | '_'

export function ProfileWizardModal() {
  const { profile, refreshProfile, mustFinishProfile } = useProfile()
  const { notifyProfileWizardFinished } = useOnboarding()

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [gender, setGender] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [city, setCity] = useState<RussianCity | null>(null)
  const [fieldErr, setFieldErr] = useState<Partial<Record<FieldKey, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [traitsSaved, setTraitsSaved] = useState(false)

  useBodyScrollLock(mustFinishProfile)

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(avatarFile)
    setAvatarPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [avatarFile])

  useEffect(() => {
    setTraitsSaved(false)
  }, [step])

  useEffect(() => {
    if (!profile) return
    setName(profile.name ?? '')
    const g = profile.gender ?? ''
    setGender(g === 'male' || g === 'female' ? g : '')
    setBirthDate(profile.birth_date ?? '')
    setBio(profile.bio ?? '')
    if (
      profile.city_name &&
      profile.latitude != null &&
      profile.longitude != null &&
      Number.isFinite(profile.latitude) &&
      Number.isFinite(profile.longitude)
    ) {
      setCity({
        name: profile.city_name,
        lat: profile.latitude,
        lng: profile.longitude,
      })
    } else {
      setCity(null)
    }
  }, [profile])

  if (!mustFinishProfile) return null

  function clearFieldErr(k: FieldKey) {
    setFieldErr((prev) => {
      const n = { ...prev }
      delete n[k]
      return n
    })
  }

  function nextFromBasics() {
    setError(null)
    const next: Partial<Record<FieldKey, string>> = {}
    if (!name.trim()) next.name = 'Укажите имя'
    if (gender !== 'male' && gender !== 'female') next.gender = 'Выберите пол'
    if (!birthDate) next.birth = 'Укажите дату рождения'
    else {
      const bd = new Date(birthDate)
      if (Number.isNaN(bd.getTime())) next.birth = 'Проверьте дату рождения'
      else {
        const today = new Date()
        let age = today.getFullYear() - bd.getFullYear()
        const m = today.getMonth() - bd.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age -= 1
        if (age < 14) next.birth = 'Минимальный возраст — 14 лет'
      }
    }
    setFieldErr(next)
    if (Object.keys(next).length) return
    setStep(1)
  }

  function nextFromAvatar() {
    setError(null)
    setFieldErr((prev) => {
      const n = { ...prev }
      delete n.avatar
      return n
    })
    setStep(2)
  }

  async function saveDemographicsToServer() {
    const body: ProfileSaveBody = {
      name: name.trim(),
      gender,
      birth_date: birthDate,
      city_name: city!.name,
      latitude: city!.lat,
      longitude: city!.lng,
      ...(bio.trim() ? { bio: bio.trim() } : {}),
    }
    if (profile) await updateProfile(body)
    else await createProfile(body)
    if (avatarFile) {
      await uploadProfileAvatar(avatarFile)
      setAvatarFile(null)
    }
    await refreshProfile()
  }

  async function goFromCityToTraits(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!city) {
      setFieldErr({ city: 'Выберите город из списка' })
      return
    }
    const bd = new Date(birthDate)
    if (!birthDate || Number.isNaN(bd.getTime())) {
      setFieldErr({ birth: 'Проверьте дату рождения' })
      return
    }
    const today = new Date()
    let age = today.getFullYear() - bd.getFullYear()
    const m = today.getMonth() - bd.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age -= 1
    if (age < 14) {
      setFieldErr({ birth: 'Минимальный возраст — 14 лет' })
      return
    }

    setBusy(true)
    try {
      await saveDemographicsToServer()
      setStep(3)
    } catch (err) {
      setError(userFacingRequestError(err))
    } finally {
      setBusy(false)
    }
  }

  const avatarDisplaySrc = avatarPreviewUrl ?? profileAvatarSrc(profile)

  const sub =
    step === 0
      ? 'Данные для подбора. Пол и дату рождения потом изменить нельзя.'
      : step === 1
        ? 'Аватар вашего профиля по желанию (до 3 МБ).'
        : step === 2
          ? 'Укажите город проживания.'
          : 'Короткая анкета Big Five (15 вопросов) — обязательна для подбора. Затем выберите интересы.'

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      <div
        className={`wizard-card${step === 3 ? ' wizard-card--wide' : ''}${step === 2 ? ' wizard-card--city' : ''}`}
      >
        <div className="wizard-card-head">
          <div className="wizard-steps" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`wizard-step-pill${step >= i ? ' wizard-step-pill--on' : ''}`} />
            ))}
          </div>
          <h2 id="wizard-title">{titles[step]}</h2>
          <p className="wizard-sub">{sub}</p>
        </div>

        <div className={`wizard-card-scroll prm-scrollbar${step === 2 ? ' wizard-card-scroll--city' : ''}`}>
          {step === 0 ? (
            <>
              <div className="wizard-field">
                <label className="field-label" htmlFor="wiz-name">
                  Имя <span className="req-mark">*</span>
                </label>
                <input
                  id="wiz-name"
                  className={`field-input${fieldErr.name ? ' field-input--invalid' : ''}`}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    clearFieldErr('name')
                  }}
                  placeholder="Как к вам обращаться"
                  autoComplete="name"
                />
                {fieldErr.name ? <p className="wizard-field-error">{fieldErr.name}</p> : null}
                <p className="profile-field-hint">Имя потом можно изменить в профиле.</p>
              </div>
              <div className="wizard-field">
                <label className="field-label" htmlFor="wiz-gender">
                  Пол <span className="req-mark">*</span>
                </label>
                <select
                  id="wiz-gender"
                  className={fieldErr.gender ? 'field-input--invalid' : undefined}
                  value={gender}
                  onChange={(e) => {
                    setGender(e.target.value)
                    clearFieldErr('gender')
                  }}
                  aria-label="Пол"
                >
                  <option value="">Выберите пол</option>
                  <option value="male">Мужской</option>
                  <option value="female">Женский</option>
                </select>
                {fieldErr.gender ? <p className="wizard-field-error">{fieldErr.gender}</p> : null}
                <p className="profile-field-hint">После сохранения анкеты пол изменить нельзя.</p>
              </div>
              <div className="wizard-field">
                <label className="field-label" htmlFor="wiz-birth">
                  Дата рождения <span className="req-mark">*</span>
                </label>
                <input
                  id="wiz-birth"
                  type="date"
                  className={`field-input input-date-pretty${fieldErr.birth ? ' field-input--invalid' : ''}`}
                  value={birthDate}
                  onChange={(e) => {
                    setBirthDate(e.target.value)
                    clearFieldErr('birth')
                  }}
                />
                {fieldErr.birth ? <p className="wizard-field-error">{fieldErr.birth}</p> : null}
                <p className="profile-field-hint">Дату рождения после сохранения анкеты изменить нельзя.</p>
              </div>
              <div className="wizard-field">
                <label className="field-label" htmlFor="wiz-bio">
                  О себе
                </label>
                <textarea
                  id="wiz-bio"
                  className="field-input"
                  rows={3}
                  maxLength={4000}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Необязательно: пара слов о вас, увлечениях или целях на платформе"
                />
                <p className="profile-field-hint">До 4000 символов. Позже можно изменить в профиле.</p>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <div className="wizard-avatar-block">
              <img className="wizard-avatar-preview" src={avatarDisplaySrc} alt="" width={112} height={112} />
              <label className="btn ghost wizard-avatar-file-label">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="wizard-avatar-file-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) {
                      setAvatarFile(null)
                      clearFieldErr('avatar')
                      return
                    }
                    if (f.size > MAX_AVATAR_BYTES) {
                      setAvatarFile(null)
                      setFieldErr((prev) => ({ ...prev, avatar: 'Файл больше 3 МБ' }))
                      return
                    }
                    setFieldErr((prev) => {
                      const n = { ...prev }
                      delete n.avatar
                      return n
                    })
                    setAvatarFile(f)
                  }}
                />
                Выбрать фото
              </label>
              {avatarFile ? <p className="wizard-avatar-name muted">{avatarFile.name}</p> : null}
              {fieldErr.avatar ? <p className="wizard-field-error">{fieldErr.avatar}</p> : null}
            </div>
          ) : null}

          {step === 2 ? (
            <>
              <CityPicker
                value={city}
                onChange={(c) => {
                  setCity(c)
                  clearFieldErr('city')
                }}
                required
                unboundedSuggestions
              />
              {fieldErr.city ? <p className="wizard-field-error">{fieldErr.city}</p> : null}
              {error ? <p className="error">{error}</p> : null}
            </>
          ) : null}

          {step !== 2 && step !== 3 && error ? <p className="error">{error}</p> : null}

          {step === 3 ? (
            traitsSaved ? (
              <div className="wizard-traits-done">
                <p className="wizard-traits-done-title">Анкета сохранена</p>
                <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>
                  Выберите не менее 5 интересов в окне поверх мастера. После сохранения интересов профиль будет
                  завершён.
                </p>
              </div>
            ) : (
              <>
                {error ? <p className="error">{error}</p> : null}
                <BigFiveLikertSurvey
                  title="Быстрая анкета"
                  questions={FAST_QUESTIONS}
                  pageSize={3}
                  busy={busy}
                  onCancel={() => setStep(2)}
                  onComplete={async (answers) => {
                    setError(null)
                    setBusy(true)
                    try {
                      await submitShortQuestionnaire(answers)
                      await refreshProfile()
                      setTraitsSaved(true)
                      notifyProfileWizardFinished()
                    } catch (err) {
                      setError(userFacingRequestError(err))
                    } finally {
                      setBusy(false)
                    }
                  }}
                />
              </>
            )
          ) : null}
        </div>

        <div className="wizard-card-foot">
          {step === 0 ? (
            <div className="wizard-actions">
              <button type="button" className="btn primary" onClick={nextFromBasics}>
                Далее
              </button>
            </div>
          ) : null}
          {step === 1 ? (
            <div className="wizard-actions wizard-actions--avatar">
              <button type="button" className="btn ghost" onClick={() => setStep(0)}>
                Назад
              </button>
              <button type="button" className="btn primary" onClick={nextFromAvatar}>
                Далее
              </button>
            </div>
          ) : null}
          {step === 2 ? (
            <form className="wizard-foot-form" onSubmit={goFromCityToTraits}>
              <div className="wizard-actions">
                <button type="button" className="btn ghost" onClick={() => setStep(1)}>
                  Назад
                </button>
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'Сохранение…' : 'Далее'}
                </button>
              </div>
            </form>
          ) : null}
          {step === 3 && traitsSaved ? (
            <div className="wizard-actions">
              <span className="muted" style={{ fontSize: '0.88rem', alignSelf: 'center' }}>
                Дождитесь выбора интересов…
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
