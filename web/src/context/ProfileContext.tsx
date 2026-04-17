import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchProfileMe, type Profile } from '../api/client'
import { useAuth } from './AuthContext'

type ProfileState = {
  profile: Profile | null
  loading: boolean
  refreshProfile: (opts?: { quiet?: boolean }) => Promise<void>
  /** Профиль есть и заполнен по правилам бэкенда */
  isReady: boolean
  /** Нет профиля или профиль неполный (мастер на главном экране) */
  mustFinishProfile: boolean
}

const ProfileContext = createContext<ProfileState | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { token, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!token) {
      setProfile(null)
      setLoading(false)
      return
    }
    const quiet = Boolean(opts?.quiet)
    if (!quiet) setLoading(true)
    try {
      const p = await fetchProfileMe()
      setProfile(p)
    } catch {
      setProfile(null)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (authLoading) return
    if (!token) {
      setProfile(null)
      setLoading(false)
      return
    }
    void refreshProfile()
  }, [token, authLoading, refreshProfile])

  const mustFinishProfile = Boolean(
    token && !authLoading && !loading && (!profile || profile.is_complete !== true),
  )
  const isReady = Boolean(
    token && !authLoading && !loading && profile?.is_complete === true,
  )

  const value = useMemo(
    () => ({
      profile,
      loading: authLoading || (Boolean(token) && loading),
      refreshProfile,
      isReady,
      mustFinishProfile,
    }),
    [profile, authLoading, loading, token, mustFinishProfile, refreshProfile, isReady],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
