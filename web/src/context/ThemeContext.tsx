import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'event-match-site-theme'

export type SiteThemePreference = 'light' | 'dark' | 'system'

type ThemeContextValue = {
  preference: SiteThemePreference
  resolved: 'light' | 'dark'
  setPreference: (t: SiteThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStored(): SiteThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

function resolve(pref: SiteThemePreference, prefersDark: boolean): 'light' | 'dark' {
  if (pref === 'light') return 'light'
  if (pref === 'dark') return 'dark'
  return prefersDark ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPrefState] = useState<SiteThemePreference>(() => readStored())
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
  )

  const resolved = useMemo(() => resolve(preference, prefersDark), [preference, prefersDark])

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-color-scheme', resolved)
    document.documentElement.style.colorScheme = resolved
  }, [resolved])

  useLayoutEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setPrefersDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setPreference = useCallback((t: SiteThemePreference) => {
    setPrefState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
