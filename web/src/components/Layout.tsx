import { BellAlertIcon } from '@heroicons/react/24/outline'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { profileAvatarSrc } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useOnboarding } from '../context/OnboardingContext'
import { useProfile } from '../context/ProfileContext'
import { InterestsModal } from './InterestsModal'
import { MatchWeightsModal } from './MatchWeightsModal'
import { ProfileWizardModal } from './ProfileWizardModal'
import { UserAccountMenu } from './UserAccountMenu'
import './Layout.css'

export function Layout() {
  const navigate = useNavigate()
  const { token, logout: clearAuth } = useAuth()
  const logout = () => {
    clearAuth()
    navigate('/login', { replace: true })
  }
  const { profile, loading: profileLoading, mustFinishProfile } = useProfile()
  const {
    matchWeightsModalOpen,
    matchWeightsModalVariant,
    closeMatchWeightsModal,
  } = useOnboarding()

  const displayName = profile?.name?.trim()
  const navTitle = profileLoading && token ? '…' : displayName || 'Аккаунт'

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/logo.svg" alt="" className="brand-logo" width={34} height={34} />
          <span className="brand-text">Event match</span>
        </Link>
        <nav className="nav">
          {token ? (
            <>
              <NavLink
                to="/"
                end
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                Рекомендации
              </NavLink>
              {!profileLoading && !mustFinishProfile ? (
                <NavLink to="/my-events" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Мои события
                </NavLink>
              ) : null}
              {!profileLoading && !mustFinishProfile ? (
                <NavLink to="/chats" className={({ isActive }) => (isActive ? 'active' : '')}>
                  Чаты
                </NavLink>
              ) : null}
              {!profileLoading && !mustFinishProfile ? (
                <NavLink
                  to="/notifications"
                  className={({ isActive }) => `nav-bell${isActive ? ' active' : ''}`}
                  title="Уведомления"
                  aria-label="Уведомления"
                >
                  <BellAlertIcon width={22} height={22} />
                </NavLink>
              ) : null}
              {mustFinishProfile && !profileLoading ? (
                <span className="nav-warn">Заполните профиль</span>
              ) : null}
              {profileLoading && token ? (
                <span className="nav-user nav-user--static">
                  <span className="nav-user-name">…</span>
                </span>
              ) : mustFinishProfile ? (
                <span className="nav-user nav-user--static">
                  <img
                    className="nav-user-avatar"
                    src={profileAvatarSrc(profile)}
                    width={32}
                    height={32}
                    alt=""
                    decoding="async"
                  />
                  <span className="nav-user-name">{navTitle}</span>
                </span>
              ) : (
                <UserAccountMenu
                  profile={profile}
                  displayName={displayName ?? ''}
                  profileLoading={profileLoading}
                />
              )}
              <button type="button" className="btn ghost" onClick={logout}>
                Выйти
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Вход</NavLink>
              <NavLink to="/register" className="btn small">
                Регистрация
              </NavLink>
            </>
          )}
        </nav>
      </header>
      <main className="main">
        <Outlet />
      </main>
      {token ? <ProfileWizardModal /> : null}
      {token ? <InterestsModal /> : null}
      {token ? (
        <MatchWeightsModal
          open={matchWeightsModalOpen}
          variant={matchWeightsModalVariant}
          onClose={closeMatchWeightsModal}
        />
      ) : null}
    </div>
  )
}
