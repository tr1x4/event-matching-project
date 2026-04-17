import { useEffect, useId, useState } from 'react'
import { fetchCitySuggest, userFacingRequestError } from '../api/client'
import type { RussianCity } from '../data/russianCities'
import { displayCityName } from '../utils/profileUi'
import './CityPicker.css'

type Props = {
  value: RussianCity | null
  onChange: (city: RussianCity | null) => void
  disabled?: boolean
  /** Показать звёздочку обязательного поля рядом с подписью «Город» */
  required?: boolean
  /** Краткая подсказка под подписью (официальный тон) */
  hint?: string
  /** Без прокрутки списка подсказок (для модалок, чтобы варианты не «терялись» в скролле) */
  unboundedSuggestions?: boolean
}

type PanelState = 'hidden' | 'loading' | 'results' | 'empty' | 'error'

function norm(s: string): string {
  return s.trim().toLowerCase()
}

const DEBOUNCE_MS = 280

export function CityPicker({ value, onChange, disabled, required, hint, unboundedSuggestions }: Props) {
  const idBase = useId()
  const listId = `${idBase}-list`
  const [query, setQuery] = useState(displayCityName(value?.name ?? ''))
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<RussianCity[]>([])
  const [panel, setPanel] = useState<PanelState>('hidden')
  const [errMsg, setErrMsg] = useState<string | null>(null)

  useEffect(() => {
    setQuery(value?.name ?? '')
  }, [value])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setSuggestions([])
      setPanel('hidden')
      setErrMsg(null)
      return
    }

    let cancelled = false
    setErrMsg(null)
    setSuggestions([])
    setPanel('loading')

    const timer = window.setTimeout(() => {
      ;(async () => {
        try {
          const list = await fetchCitySuggest(q)
          if (cancelled) return
          setSuggestions(list)
          setPanel(list.length > 0 ? 'results' : 'empty')
        } catch (e) {
          if (cancelled) return
          setSuggestions([])
          setErrMsg(userFacingRequestError(e))
          setPanel('error')
        }
      })()
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  function pick(c: RussianCity) {
    onChange(c)
    setQuery(displayCityName(c.name))
    setOpen(false)
    setPanel('hidden')
    setErrMsg(null)
  }

  function onInputChange(v: string) {
    setQuery(v)
    setOpen(true)
    const q = norm(v)
    if (!q) {
      onChange(null)
      return
    }
    const exact = suggestions.find((c) => norm(c.name) === q)
    if (exact) onChange(exact)
    else if (value && norm(value.name) !== q) onChange(null)
  }

  const showDropdown = open && panel !== 'hidden'

  return (
    <div className="city-picker">
      <label className="field-label" htmlFor={`${idBase}-input`}>
        Город
        {required ? (
          <>
            {' '}
            <span className="req-mark">*</span>
          </>
        ) : null}
      </label>
      {hint ? <p className="profile-field-hint">{hint}</p> : null}
      <input
        id={`${idBase}-input`}
        type="text"
        className="city-picker__input field-input"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder="Начните вводить город"
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 180)
        }}
        onChange={(e) => onInputChange(e.target.value)}
      />
      {showDropdown ? (
        <ul
          id={listId}
          className={`city-picker__list${unboundedSuggestions ? ' city-picker__list--unbounded' : ''}`}
          role="listbox"
        >
          {panel === 'loading' ? (
            <li className="city-picker__loading" role="presentation">
              Поиск…
            </li>
          ) : null}
          {panel === 'error' && errMsg ? (
            <li className="city-picker__error" role="presentation">
              {errMsg}
            </li>
          ) : null}
          {panel === 'results'
            ? suggestions.map((c) => (
                <li key={`${c.name}-${c.lat}-${c.lng}`} role="option">
                  <button
                    type="button"
                    className="city-picker__option"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(c)}
                  >
                    {displayCityName(c.name)}
                  </button>
                </li>
              ))
            : null}
          {panel === 'empty' ? (
            <li className="city-picker__empty" role="presentation">
              Нет вариантов
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
