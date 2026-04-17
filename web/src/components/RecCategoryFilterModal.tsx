import { useCallback, useEffect, useMemo, useState } from 'react'
import { EVENT_CATEGORIES } from '../data/eventCategories'
import { EventCategoryIcon } from './EventCategoryIcon'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import './InterestsModal.css'
import './ProfileModalShared.css'

type Props = {
  open: boolean
  initialSlugs: string[]
  onClose: () => void
  onApply: (slugs: string[]) => void
}

export function RecCategoryFilterModal({ open, initialSlugs, onClose, onApply }: Props) {
  useBodyScrollLock(open)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setSelected(new Set(initialSlugs))
  }, [open, initialSlugs])

  const toggle = useCallback((slug: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(slug)) n.delete(slug)
      else n.add(slug)
      return n
    })
  }, [])

  const onOk = useCallback(() => {
    onApply([...selected])
    onClose()
  }, [onApply, onClose, selected])

  const sorted = useMemo(() => [...EVENT_CATEGORIES].sort((a, b) => a.label_ru.localeCompare(b.label_ru, 'ru')), [])

  if (!open) return null

  return (
    <div
      className="prm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rcf-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="prm-card prm-card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="prm-head">
          <h2 id="rcf-title">Категории в ленте</h2>
          <p className="prm-intro">Выберите нужные или снимите все — в ленте останутся все категории</p>
        </div>
        <div className="prm-body prm-scrollbar">
          <div className="interest-grid interest-grid--compact">
            {sorted.map((it) => {
              const on = selected.has(it.slug)
              return (
                <button
                  key={it.slug}
                  type="button"
                  className={`interest-card${on ? ' interest-card--on' : ''}`}
                  onClick={() => toggle(it.slug)}
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
        <div className="prm-foot">
          <div className="prm-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Отмена
            </button>
            <button type="button" className="btn primary" onClick={onOk}>
              Применить
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
