import { useEffect, useMemo, useState } from 'react'
import {
  resetPersonalityQuestionnaire,
  submitLongQuestionnaire,
  submitShortQuestionnaire,
  userFacingRequestError,
  type Profile,
} from '../api/client'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { FAST_QUESTIONS, LONG_QUESTIONS } from '../questionnaire/bfiQuestions'
import '../pages/FormPage.css'
import './ProfileModalShared.css'
import './ProfilePersonalityEditModal.css'
import { BigFiveLikertSurvey } from './BigFiveLikertSurvey'

const TRAIT_ROWS = [
  {
    key: 'openness',
    label: 'Открытость опыту',
    hint: 'Интерес к новому, идеям и необычному опыту',
    idx: 0,
  },
  {
    key: 'conscientiousness',
    label: 'Добросовестность',
    hint: 'Организованность, ответственность, склонность планировать',
    idx: 1,
  },
  {
    key: 'extraversion',
    label: 'Экстраверсия',
    hint: 'Социальная активность, энергичность в общении',
    idx: 2,
  },
  {
    key: 'agreeableness',
    label: 'Доброжелательность',
    hint: 'Мягкость, эмпатия, готовность учитывать других',
    idx: 3,
  },
  {
    key: 'neuroticism',
    label: 'Нейротизм',
    hint: 'Эмоциональная чувствительность и склонность к переживаниям',
    idx: 4,
  },
] as const

type View = 'hub' | 'short' | 'long'

type Props = {
  open: boolean
  onClose: () => void
  profile: Profile | null
  refreshProfile: () => Promise<void>
}

export function ProfilePersonalityEditModal({ open, onClose, profile, refreshProfile }: Props) {
  useBodyScrollLock(open)
  const [view, setView] = useState<View>('hub')
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const personality = useMemo(() => {
    const p = profile?.personality
    return Array.isArray(p) && p.length === 5 ? p : null
  }, [profile?.personality])

  const qm = profile?.questionnaire

  useEffect(() => {
    if (!open) return
    setView('hub')
    setShowResetConfirm(false)
    setHowOpen(false)
    setError(null)
  }, [open])

  if (!open || !profile) return null

  async function afterQuestionnaire() {
    await refreshProfile()
    setView('hub')
  }

  async function onResetConfirmed() {
    setError(null)
    setBusy(true)
    try {
      await resetPersonalityQuestionnaire()
      await refreshProfile()
      setShowResetConfirm(false)
      setView('hub')
    } catch (err) {
      setError(userFacingRequestError(err))
    } finally {
      setBusy(false)
    }
  }

  const hub = (
    <>
      <div className="prm-head">
        <h2 id="prm-pers-title">Черты личности</h2>
        <p className="prm-intro">
          Ваш профиль рассчитывается по анкете Big Five. Чем точнее ответы, тем лучше подбор людей и событий.
        </p>
      </div>
      <div className="prm-body prm-scrollbar">
        <h3 className="bf-hub-sub">Текущий профиль</h3>
        {personality ? (
          <div className="bf-trait-cards">
            {TRAIT_ROWS.map((t) => {
              const v = personality[t.idx]
              const pct = Math.max(1, Math.min(100, Math.round(v * 100)))
              return (
                <div key={t.key} className="bf-trait-card">
                  <div className="bf-trait-card-top">
                    <span className="bf-trait-title">{t.label}</span>
                    <span className="bf-trait-pct">{pct}%</span>
                  </div>
                  <p className="bf-trait-hint">{t.hint}</p>
                  <div className="bf-trait-bar-wrap" aria-hidden>
                    <div className="bf-trait-bar" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="muted">Пройдите короткую анкету, чтобы получить профиль черт.</p>
        )}

        {qm?.source === 'long' ? (
          <div className="bf-badge bf-badge--accent">Используется уточнённый профиль (полная анкета)</div>
        ) : null}

        <div className="bf-status-block">
          <p className="bf-status-line">
            <strong>Быстрая анкета:</strong> {qm?.short_completed ? 'пройдена' : 'не пройдена'}
          </p>
          <p className="bf-status-line">
            <strong>Полная анкета:</strong> {qm?.long_completed ? 'пройдена' : 'не пройдена'}
          </p>
          {qm?.recomputed_at ? (
            <p className="bf-status-line muted" style={{ fontSize: '0.88rem' }}>
              Последний пересчёт: {new Date(qm.recomputed_at).toLocaleString('ru-RU')}
            </p>
          ) : null}
          <p className="bf-status-line muted" style={{ fontSize: '0.88rem', marginTop: '0.35rem' }}>
            {qm?.source === 'long'
              ? 'Профиль уточнён по полной анкете.'
              : qm?.short_completed
                ? 'Профиль рассчитан по короткой анкете.'
                : null}
          </p>
        </div>

        <div className="bf-actions">
          <button type="button" className="btn primary" onClick={() => setView('long')} disabled={busy}>
            {qm?.long_completed ? 'Пройти полную анкету заново' : 'Пройти полную анкету'}
          </button>
          <button type="button" className="btn ghost" onClick={() => setView('short')} disabled={busy}>
            Пройти короткую анкету заново
          </button>
          <button
            type="button"
            className="btn danger-ghost bf-reset-muted"
            onClick={() => setShowResetConfirm(true)}
            disabled={busy}
          >
            Сбросить результаты и пройти заново
          </button>
        </div>

        <div className="bf-how-wrap">
          <button type="button" className="btn primary bf-how-toggle" onClick={() => setHowOpen((x) => !x)}>
            <span>Как это работает?</span>
            <span className="bf-how-chevron" aria-hidden>
              {howOpen ? '▼' : '▶'}
            </span>
          </button>
          {howOpen ? (
            <p className="bf-how-text">
              Мы используем модель Big Five. Ваши ответы преобразуются в 5 числовых показателей от 0 до 1. Эти
              показатели участвуют в подборе людей и событий.
            </p>
          ) : null}
        </div>

        {error ? <p className="error">{error}</p> : null}
      </div>
      <div className="prm-foot">
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
          Закрыть
        </button>
      </div>
    </>
  )

  return (
    <div
      className="prm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prm-pers-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget && view === 'hub' && !showResetConfirm) {
          onClose()
        }
      }}
    >
      <div className="prm-card prm-card--wide" onClick={(e) => e.stopPropagation()}>
        {view === 'hub' ? hub : null}
        {view === 'short' ? (
          <>
            <div className="prm-head">
              <h2>Короткая анкета</h2>
              <p className="prm-intro">15 вопросов, около 2–3 минут.</p>
            </div>
            <div className="prm-body prm-scrollbar">
              <BigFiveLikertSurvey
                title="Быстрая анкета Big Five"
                questions={FAST_QUESTIONS}
                pageSize={3}
                busy={busy}
                onCancel={() => setView('hub')}
                onComplete={async (answers) => {
                  setError(null)
                  setBusy(true)
                  try {
                    await submitShortQuestionnaire(answers)
                    await afterQuestionnaire()
                  } catch (err) {
                    setError(userFacingRequestError(err))
                  } finally {
                    setBusy(false)
                  }
                }}
              />
              {error ? <p className="error">{error}</p> : null}
            </div>
          </>
        ) : null}
        {view === 'long' ? (
          <>
            <div className="prm-head">
              <h2>Полная анкета</h2>
              <p className="prm-intro">50 вопросов, до ~15 минут. Можно проходить по частям на экране.</p>
            </div>
            <div className="prm-body prm-scrollbar">
              <BigFiveLikertSurvey
                title="Полная анкета Big Five"
                questions={LONG_QUESTIONS}
                pageSize={5}
                busy={busy}
                onCancel={() => setView('hub')}
                onComplete={async (answers) => {
                  setError(null)
                  setBusy(true)
                  try {
                    await submitLongQuestionnaire(answers)
                    await afterQuestionnaire()
                  } catch (err) {
                    setError(userFacingRequestError(err))
                  } finally {
                    setBusy(false)
                  }
                }}
              />
              {error ? <p className="error">{error}</p> : null}
            </div>
          </>
        ) : null}

        {showResetConfirm ? (
          <div className="bf-confirm-overlay" role="presentation">
            <div className="bf-confirm-card">
              <h3 className="bf-confirm-title">Сбросить результаты?</h3>
              <p className="muted" style={{ fontSize: '0.92rem' }}>
                Будут удалены ответы анкет и рассчитанные черты. Профиль станет неполным, пока вы снова не пройдёте
                короткую анкету.
              </p>
              <div className="bf-confirm-actions">
                <button type="button" className="btn ghost" onClick={() => setShowResetConfirm(false)} disabled={busy}>
                  Отмена
                </button>
                <button type="button" className="btn danger" onClick={onResetConfirmed} disabled={busy}>
                  {busy ? 'Сброс…' : 'Сбросить'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
