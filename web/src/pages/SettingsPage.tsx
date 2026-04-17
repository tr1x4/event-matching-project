import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile, userFacingRequestError, type Profile } from '../api/client'
import { PasswordChangeModal } from '../components/PasswordChangeModal'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import './FormPage.css'
import './ProfilePage.css'
import './SettingsPage.css'

type DmPrivacy = NonNullable<Profile['dm_privacy']>

export function SettingsPage() {
  const { token, user } = useAuth()
  const { profile, loading: profLoading, mustFinishProfile, refreshProfile } = useProfile()
  const navigate = useNavigate()
  const [dmPrivacy, setDmPrivacy] = useState<DmPrivacy>('all')
  const [privacyBusy, setPrivacyBusy] = useState(false)
  const [privacyErr, setPrivacyErr] = useState<string | null>(null)
  const [pwdOpen, setPwdOpen] = useState(false)

  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (!profLoading && mustFinishProfile) navigate('/', { replace: true })
  }, [profLoading, mustFinishProfile, navigate])

  useEffect(() => {
    const v = profile?.dm_privacy
    if (v === 'all' || v === 'acquaintances' || v === 'nobody') setDmPrivacy(v)
  }, [profile?.dm_privacy])

  if (!token) return null
  if (profLoading || mustFinishProfile) {
    return (
      <div className="card">
        <p className="muted">Загрузка…</p>
      </div>
    )
  }

  return (
    <div className="card wide profile-edit">
      <div className="page-hero-inline">
        <h1>Настройки</h1>
      </div>
      <p className="muted pp-lead">Параметры учётной записи.</p>

      <section className="settings-account-block">
        <div className="field-label">Адрес электронной почты</div>
        <p className="settings-account-email">{user?.email ?? '—'}</p>
        <button type="button" className="btn ghost" style={{ marginTop: '0.65rem' }} onClick={() => setPwdOpen(true)}>
          Сменить пароль
        </button>
      </section>

      <PasswordChangeModal open={pwdOpen} onClose={() => setPwdOpen(false)} />

      <section className="pp-settings-section">
        <h2 className="profile-section-title">Приватность</h2>
        <p className="field-label settings-dm-legend">Кто может начать с вами личную переписку</p>
        <div className="privacy-cards" role="radiogroup" aria-label="Кто может писать в личку">
          <label className={`privacy-card${dmPrivacy === 'all' ? ' privacy-card--on' : ''}`}>
            <input
              type="radio"
              name="dm_privacy"
              className="privacy-card-input"
              checked={dmPrivacy === 'all'}
              onChange={() => setDmPrivacy('all')}
            />
            <div className="privacy-card-stack">
              <span className="privacy-card-title">Все</span>
              <p className="privacy-card-desc muted">Любой пользователь, открывший ваш профиль.</p>
            </div>
          </label>
          <label className={`privacy-card${dmPrivacy === 'acquaintances' ? ' privacy-card--on' : ''}`}>
            <input
              type="radio"
              name="dm_privacy"
              className="privacy-card-input"
              checked={dmPrivacy === 'acquaintances'}
              onChange={() => setDmPrivacy('acquaintances')}
            />
            <div className="privacy-card-stack">
              <span className="privacy-card-title">Только знакомые</span>
              <p className="privacy-card-desc muted">Есть общее событие (включая завершённые).</p>
            </div>
          </label>
          <label className={`privacy-card${dmPrivacy === 'nobody' ? ' privacy-card--on' : ''}`}>
            <input
              type="radio"
              name="dm_privacy"
              className="privacy-card-input"
              checked={dmPrivacy === 'nobody'}
              onChange={() => setDmPrivacy('nobody')}
            />
            <div className="privacy-card-stack">
              <span className="privacy-card-title">Никто</span>
            </div>
          </label>
        </div>
        {privacyErr ? <p className="error">{privacyErr}</p> : null}
        <button
          type="button"
          className="btn primary"
          style={{ marginTop: '0.75rem' }}
          disabled={privacyBusy || (profile?.dm_privacy === dmPrivacy && profile != null)}
          onClick={async () => {
            setPrivacyErr(null)
            setPrivacyBusy(true)
            try {
              await updateProfile({ dm_privacy: dmPrivacy })
              await refreshProfile({ quiet: true })
            } catch (e) {
              setPrivacyErr(userFacingRequestError(e))
            } finally {
              setPrivacyBusy(false)
            }
          }}
        >
          {privacyBusy ? 'Сохранение…' : 'Сохранить настройки приватности'}
        </button>
      </section>
    </div>
  )
}
