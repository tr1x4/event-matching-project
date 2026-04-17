const trimSlash = (s: string) => s.replace(/\/$/, '')

export const AUTH_URL = trimSlash(
  import.meta.env.VITE_AUTH_URL ?? 'http://127.0.0.1:8003',
)
export const PROFILES_URL = trimSlash(
  import.meta.env.VITE_PROFILES_URL ?? 'http://127.0.0.1:8001',
)
export const MATCH_URL = trimSlash(
  import.meta.env.VITE_MATCH_URL ?? 'http://127.0.0.1:8000',
)
export const EVENTS_URL = trimSlash(
  import.meta.env.VITE_EVENTS_URL ?? 'http://127.0.0.1:8002',
)
export const CHATS_URL = trimSlash(
  import.meta.env.VITE_CHATS_URL ?? 'http://127.0.0.1:8004',
)
