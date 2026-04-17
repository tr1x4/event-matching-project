/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_URL?: string
  readonly VITE_PROFILES_URL?: string
  readonly VITE_MATCH_URL?: string
  readonly VITE_EVENTS_URL?: string
  readonly VITE_CHATS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
