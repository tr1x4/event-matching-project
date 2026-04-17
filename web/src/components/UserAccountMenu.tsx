import { ChevronDownIcon, ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { profileAvatarSrc, type Profile } from '../api/client'
import { useTheme } from '../context/ThemeContext'
import './UserAccountMenu.css'

type Props = {
  profile: Profile | null
  displayName: string
  profileLoading: boolean
}

export function UserAccountMenu({ profile, displayName, profileLoading }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { preference, setPreference } = useTheme()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const title = profileLoading ? '…' : (displayName.trim() || 'Аккаунт')

  return (
    <div className="nav-account-wrap" ref={wrapRef}>
      <button
        type="button"
        className="nav-user-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <img
          className="nav-user-avatar"
          src={profileAvatarSrc(profile)}
          width={32}
          height={32}
          alt=""
          decoding="async"
        />
        <span className="nav-user-name">{title}</span>
        <ChevronDownIcon className="nav-user-chevron" aria-hidden width={18} height={18} />
      </button>
      {open ? (
        <div className="nav-account-dropdown" role="menu">
          <Link to="/profile" className="nav-account-item" role="menuitem" onClick={() => setOpen(false)}>
            Мой профиль
          </Link>
          <Link to="/settings" className="nav-account-item" role="menuitem" onClick={() => setOpen(false)}>
            Настройки
          </Link>
          <div className="nav-account-theme" role="presentation">
            <div className="nav-account-theme-btns" role="group" aria-label="Тема оформления">
              <button
                type="button"
                className="nav-account-theme-btn"
                role="menuitem"
                title="Светлая тема"
                aria-label="Светлая тема"
                aria-pressed={preference === 'light'}
                onClick={() => setPreference('light')}
              >
                <SunIcon width={20} height={20} aria-hidden />
              </button>
              <button
                type="button"
                className="nav-account-theme-btn"
                role="menuitem"
                title="Тёмная тема"
                aria-label="Тёмная тема"
                aria-pressed={preference === 'dark'}
                onClick={() => setPreference('dark')}
              >
                <MoonIcon width={20} height={20} aria-hidden />
              </button>
              <button
                type="button"
                className="nav-account-theme-btn"
                role="menuitem"
                title="Как на устройстве"
                aria-label="Тема как на устройстве"
                aria-pressed={preference === 'system'}
                onClick={() => setPreference('system')}
              >
                <ComputerDesktopIcon width={20} height={20} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
