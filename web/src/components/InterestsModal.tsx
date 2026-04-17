import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchInterestsCatalog,
  putProfileInterests,
  type InterestCatalogItem,
  userFacingRequestError,
} from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useOnboarding } from '../context/OnboardingContext'
import { useProfile } from '../context/ProfileContext'
import { InterestHeroIcon } from './InterestHeroIcon'
import './InterestsModal.css'
import './ProfileModalShared.css'

const MIN_INTERESTS = 5

export function InterestsModal() {
  const {
    interestsModalOpen,
    interestModalVariant,
    closeInterestsModal,
    openMatchWeightsModal,
  } = useOnboarding()
  const { profile, loading: profLoading, refreshProfile } = useProfile()
  useBodyScrollLock(interestsModalOpen)

  const [catalog, setCatalog] = useState<InterestCatalogItem[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  useEffect(() => {
    if (!interestsModalOpen) return
    if (!profile?.selected_interests) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(profile.selected_interests.map((x) => x.id)))
  }, [profile, interestsModalOpen])

  useEffect(() => {
    if (!interestsModalOpen) return
    let cancelled = false
    ;(async () => {
      try {
        const c = await fetchInterestsCatalog()
        if (!cancelled) setCatalog(c)
      } catch (e) {
        if (!cancelled) setLoadErr(userFacingRequestError(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [interestsModalOpen])

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedCount = selected.size

  async function onSave() {
    setError(null)
    if (selectedCount < MIN_INTERESTS) {
      setError(`Выберите не менее ${MIN_INTERESTS} интересов`)
      return
    }
    setBusy(true)
    try {
      await putProfileInterests([...selected])
      await refreshProfile()
      closeInterestsModal()
      if (interestModalVariant === 'wizard') {
        openMatchWeightsModal('wizard')
      }
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setBusy(false)
    }
  }

  const title = useMemo(
    () => (interestModalVariant === 'wizard' ? 'Ваши интересы' : 'Интересы'),
    [interestModalVariant],
  )

  if (!interestsModalOpen) return null

  if (profLoading) {
    return (
      <div className="interests-modal-overlay" role="dialog" aria-modal="true">
        <div className="interests-modal interests-modal--compact">
          <header className="interests-modal-head">
            <h2>{title}</h2>
          </header>
          <div className="interests-modal-compact-scroll prm-scrollbar">
            <p className="muted" style={{ margin: 0 }}>
              Загрузка…
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (loadErr) {
    return (
      <div className="interests-modal-overlay" role="dialog" aria-modal="true">
        <div className="interests-modal interests-modal--compact">
          <header className="interests-modal-head">
            <h2>{title}</h2>
          </header>
          <div className="interests-modal-compact-scroll prm-scrollbar">
            <p className="error" style={{ margin: 0 }}>
              {loadErr}
            </p>
          </div>
          <footer className="interests-modal-footer">
            <div className="interests-actions">
              <button type="button" className="btn ghost" onClick={closeInterestsModal}>
                Закрыть
              </button>
            </div>
          </footer>
        </div>
      </div>
    )
  }

  return (
    <div className="interests-modal-overlay" role="dialog" aria-modal="true">
      <div className="interests-modal">
        <header className="interests-modal-head">
          <h2>{title}</h2>
          {interestModalVariant === 'wizard' ? (
            <p className="interests-sub">Выберите не менее {MIN_INTERESTS} интересов — они нужны для рекомендаций.</p>
          ) : (
            <p className="interests-sub">Нажмите карточку, чтобы выбрать или снять интерес. Не менее {MIN_INTERESTS}.</p>
          )}
        </header>

        <div className="interests-modal-grid-scroll prm-scrollbar">
          <div className="interest-grid">
            {catalog.map((item) => {
              const on = selected.has(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`interest-card${on ? ' interest-card--on' : ''}`}
                  onClick={() => toggle(item.id)}
                >
                  <span className="interest-icon-wrap" aria-hidden>
                    <InterestHeroIcon slug={item.slug} />
                  </span>
                  <span className="interest-label">{item.label_ru}</span>
                </button>
              )
            })}
          </div>
        </div>

        <footer className="interests-modal-footer">
          <p className="interests-count">
            Выбрано: {selectedCount}
            {selectedCount < MIN_INTERESTS ? (
              <span className="muted"> — нужно ещё {MIN_INTERESTS - selectedCount}</span>
            ) : null}
          </p>
          {error ? <p className="error">{error}</p> : null}
          <div className="interests-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || selectedCount < MIN_INTERESTS}
              onClick={() => void onSave()}
            >
              {busy ? 'Сохранение…' : 'Сохранить интересы'}
            </button>
            {interestModalVariant === 'wizard' ? null : (
              <button type="button" className="btn ghost" disabled={busy} onClick={closeInterestsModal}>
                Закрыть
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
