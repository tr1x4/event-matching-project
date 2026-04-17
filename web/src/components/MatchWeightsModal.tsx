import { useCallback, useEffect, useState } from 'react'
import { updateProfile, userFacingRequestError, type Profile } from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useProfile } from '../context/ProfileContext'
import './InterestsModal.css'
import './ProfileModalShared.css'
import './MatchWeightsModal.css'

const DEFAULT_PERSONALITY_PCT = 70

type Props = {
  open: boolean
  variant: 'wizard' | 'picker'
  onClose: () => void
}

function pctFromProfile(p: Profile | null): number {
  const w = p?.match_personality_weight
  if (typeof w === 'number' && Number.isFinite(w)) {
    const x = Math.round(w * 100)
    return Math.min(95, Math.max(5, x))
  }
  return DEFAULT_PERSONALITY_PCT
}

export function MatchWeightsModal({ open, variant, onClose }: Props) {
  const { profile, refreshProfile } = useProfile()
  const [personalityPct, setPersonalityPct] = useState(DEFAULT_PERSONALITY_PCT)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useBodyScrollLock(open)

  useEffect(() => {
    if (!open) return
    setPersonalityPct(pctFromProfile(profile))
    setError(null)
  }, [open, profile])

  const interestsPct = 100 - personalityPct

  const applyDefault = useCallback(() => {
    setPersonalityPct(DEFAULT_PERSONALITY_PCT)
  }, [])

  const onSave = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const a = personalityPct / 100
      const b = interestsPct / 100
      await updateProfile({
        match_personality_weight: a,
        match_interests_weight: b,
      })
      await refreshProfile()
      onClose()
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setBusy(false)
    }
  }, [personalityPct, interestsPct, refreshProfile, onClose])

  if (!open) return null

  const title = variant === 'wizard' ? 'Важность при подборе' : 'Веса подбора событий'

  return (
    <div
      className="interests-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mwm-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget && !busy) onClose()
      }}
    >
      <div className="interests-modal interests-modal--compact match-weights-modal" onClick={(e) => e.stopPropagation()}>
        <header className="interests-modal-head">
          <h2 id="mwm-title">{title}</h2>
          <p className="interests-sub match-weights-intro">
            Укажите, насколько для вас важнее сходство по <strong>чертам личности</strong> или по{' '}
            <strong>интересам</strong> при оценке совместимости с событиями и людьми.
          </p>
        </header>

        <div className="match-weights-body prm-scrollbar">
          <div className="match-weights-labels">
            <div className="match-weights-side">
              <span className="match-weights-side-title">Характер</span>
              <span className="match-weights-side-pct">{personalityPct}%</span>
            </div>
            <div className="match-weights-side match-weights-side--right">
              <span className="match-weights-side-title">Интересы</span>
              <span className="match-weights-side-pct">{interestsPct}%</span>
            </div>
          </div>
          <label className="match-weights-slider-label" htmlFor="match-weights-range">
            Соотношение влияния
          </label>
          <input
            id="match-weights-range"
            type="range"
            min={5}
            max={95}
            step={1}
            value={personalityPct}
            onChange={(e) => setPersonalityPct(Number(e.target.value))}
            className="match-weights-range"
          />
          <p className="muted match-weights-hint">
            Вправо — больше вес у черт личности, влево — больше у интересов. Значения пересчитываются так, чтобы в сумме
            давали 100%.
          </p>
        </div>

        <footer className="interests-modal-footer">
          {error ? <p className="error">{error}</p> : null}
          <div className="interests-actions match-weights-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={applyDefault}>
              По умолчанию (70% / 30%)
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void onSave()}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>
              {variant === 'wizard' ? 'Закрыть' : 'Отмена'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
