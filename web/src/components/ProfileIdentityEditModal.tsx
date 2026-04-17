import { type FormEvent, useEffect, useState } from 'react'
import { updateProfile, userFacingRequestError, type Profile } from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import type { RussianCity } from '../data/russianCities'
import { CityPicker } from './CityPicker'
import '../pages/FormPage.css'
import './ProfileModalShared.css'

type Props = {
  open: boolean
  onClose: () => void
  profile: Profile | null
  refreshProfile: () => Promise<void>
}

export function ProfileIdentityEditModal({ open, onClose, profile, refreshProfile }: Props) {
  useBodyScrollLock(open)
  const [name, setName] = useState('')
  const [city, setCity] = useState<RussianCity | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !profile) return
    setName(profile.name ?? '')
    if (
      profile.city_name &&
      profile.latitude != null &&
      profile.longitude != null &&
      Number.isFinite(profile.latitude) &&
      Number.isFinite(profile.longitude)
    ) {
      setCity({ name: profile.city_name, lat: profile.latitude, lng: profile.longitude })
    } else {
      setCity(null)
    }
    setError(null)
  }, [open, profile])

  if (!open || !profile) return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Укажите имя.')
      return
    }
    if (!city) {
      setError('Выберите город из списка подсказок.')
      return
    }
    setBusy(true)
    try {
      await updateProfile({
        name: name.trim(),
        city_name: city.name,
        latitude: city.lat,
        longitude: city.lng,
      })
      await refreshProfile()
      onClose()
    } catch (err) {
      setError(userFacingRequestError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="prm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prm-id-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <form className="prm-card" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="prm-head">
          <h2 id="prm-id-title">Имя и город</h2>
          <p className="prm-intro">Имя и город. Пол и дату рождения здесь не меняют.</p>
        </div>
        <div className="prm-body prm-scrollbar">
          <div className="wizard-field">
            <label className="field-label" htmlFor="prm-id-name">
              Имя
            </label>
            <input
              id="prm-id-name"
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoComplete="name"
            />
          </div>
          <div className="wizard-field">
            <CityPicker value={city} onChange={setCity} required />
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>
        <div className="prm-foot">
          <div className="prm-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
