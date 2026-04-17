import { type FormEvent, useEffect, useState } from 'react'
import type { Profile } from '../api/client'
import { CityPicker } from './CityPicker'
import type { RussianCity } from '../data/russianCities'
import { displayCityName } from '../utils/profileUi'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import './ProfileModalShared.css'
import '../pages/FormPage.css'

type Props = {
  open: boolean
  profile: Profile
  /** Точка для подбора; null — брать координаты из анкеты при запросе. */
  searchOverride: RussianCity | null
  onClose: () => void
  onApply: (city: RussianCity) => void
  /** Сбросить подбор к городу из анкеты (не меняет анкету). */
  onUseProfileCity: () => void
}

export function HomeCityRadiusModal({
  open,
  profile,
  searchOverride,
  onClose,
  onApply,
  onUseProfileCity,
}: Props) {
  useBodyScrollLock(open)
  const [city, setCity] = useState<RussianCity | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (searchOverride) {
      setCity(searchOverride)
      return
    }
    if (profile.city_name && profile.latitude != null && profile.longitude != null) {
      setCity({
        name: displayCityName(profile.city_name) || profile.city_name,
        lat: profile.latitude,
        lng: profile.longitude,
      })
    } else {
      setCity(null)
    }
  }, [open, profile, searchOverride])

  if (!open) return null

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!city) {
      setError('Выберите город')
      return
    }
    onApply(city)
    onClose()
  }

  return (
    <div
      className="prm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hcrm-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <form className="prm-card prm-card--city-flow" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <div className="prm-head">
          <h2 id="hcrm-title">Город для подбора</h2>
          <p className="prm-intro muted" style={{ marginTop: '-0.25rem', fontSize: '0.88rem' }}>
            Только точка на карте для расчёта расстояния. Город в анкете не меняется.
          </p>
        </div>
        <div className="prm-body prm-scrollbar">
          <CityPicker
            value={city}
            onChange={setCity}
            required
            hint="Радиус задаётся на главной рядом с кнопкой города"
            unboundedSuggestions
          />
          {error ? <p className="error">{error}</p> : null}
        </div>
        <div className="prm-foot">
          <div className="prm-actions">
            {searchOverride ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  onUseProfileCity()
                  onClose()
                }}
              >
                Как в анкете
              </button>
            ) : null}
            <button type="button" className="btn ghost" onClick={onClose}>
              Закрыть
            </button>
            <button type="submit" className="btn primary">
              Применить
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
