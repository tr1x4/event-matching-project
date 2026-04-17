import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  ACCESS_TOKEN_UPDATED_EVENT,
  clearSession,
  getRefreshToken,
  getToken,
  meRequest,
  SESSION_INVALIDATED_EVENT,
  setStoredTokens,
  tryRefreshSession,
  type TokenResponse,
  type UserPublic,
} from '../api/client'

type AuthState = {
  token: string | null
  user: UserPublic | null
  loading: boolean
  setSession: (tokens: TokenResponse) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getToken())
  const [user, setUser] = useState<UserPublic | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    let access = getToken()
    const hasRefresh = !!getRefreshToken()

    if (!access && hasRefresh) {
      const ok = await tryRefreshSession()
      if (ok) access = getToken()
    }

    setToken(access)

    if (!access) {
      setUser(null)
      return
    }

    try {
      const u = await meRequest()
      setUser(u)
    } catch {
      clearSession()
      setToken(null)
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refreshUser()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshUser])

  useEffect(() => {
    const onAccessUpdated = () => setToken(getToken())
    const onSessionInvalid = () => {
      clearSession()
      setToken(null)
      setUser(null)
    }
    window.addEventListener(ACCESS_TOKEN_UPDATED_EVENT, onAccessUpdated)
    window.addEventListener(SESSION_INVALIDATED_EVENT, onSessionInvalid)
    return () => {
      window.removeEventListener(ACCESS_TOKEN_UPDATED_EVENT, onAccessUpdated)
      window.removeEventListener(SESSION_INVALIDATED_EVENT, onSessionInvalid)
    }
  }, [])

  const setSession = useCallback(async (tokens: TokenResponse) => {
    setStoredTokens(tokens)
    setToken(tokens.access_token)
    const u = await meRequest()
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      setSession,
      logout,
      refreshUser,
    }),
    [token, user, loading, setSession, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
