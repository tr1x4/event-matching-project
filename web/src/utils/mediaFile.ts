/** Общие правила для медиа профиля и событий (клиентская проверка перед отправкой). */

/** Максимум вложений у одного события (совпадает с лимитом на сервере). */
export const MAX_EVENT_MEDIA_TOTAL = 10

/** За один выбор в диалоге файлов (профиль и события). */
export const MAX_MEDIA_UPLOAD_BATCH = 10

/** Совпадает с лимитом на сервере (фото и видео). */
export const MAX_MEDIA_FILE_BYTES = 50 * 1024 * 1024

export function classifyMediaFile(f: File): 'video' | 'image' | 'bad' {
  const t = f.type.toLowerCase()
  if (t.startsWith('video/')) {
    if (t.includes('mp4') || t.includes('webm')) return 'video'
    return 'bad'
  }
  if (t.startsWith('image/')) {
    if (t.includes('jpeg') || t.includes('jpg') || t.includes('png') || t.includes('webp') || t.includes('gif'))
      return 'image'
    return 'bad'
  }
  const n = f.name.toLowerCase()
  if (n.endsWith('.mp4') || n.endsWith('.webm')) return 'video'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png') || n.endsWith('.webp') || n.endsWith('.gif'))
    return 'image'
  return 'bad'
}

/** Слияние для события: до MAX_EVENT_MEDIA_TOTAL файлов; за раз не больше MAX_MEDIA_UPLOAD_BATCH; каждый файл до 50 МБ. */
export function mergeEventMediaFiles(
  current: File[],
  incoming: File[],
): { ok: true; next: File[] } | { ok: false; error: string } {
  if (incoming.length > MAX_MEDIA_UPLOAD_BATCH) {
    return { ok: false, error: `За один раз не более ${MAX_MEDIA_UPLOAD_BATCH} файлов` }
  }
  const next = [...current, ...incoming]
  if (next.length > MAX_EVENT_MEDIA_TOTAL) {
    return { ok: false, error: `У события не более ${MAX_EVENT_MEDIA_TOTAL} файлов` }
  }
  for (const f of next) {
    const c = classifyMediaFile(f)
    if (c === 'bad') {
      return { ok: false, error: 'Допустимы фото (JPEG, PNG, WebP, GIF) и видео MP4 или WebM' }
    }
    if (f.size > MAX_MEDIA_FILE_BYTES) {
      return { ok: false, error: 'Каждый файл не больше 50 МБ' }
    }
  }
  return { ok: true, next }
}

/** Дозагрузка к событию: учитываются уже сохранённые на сервере файлы. */
export function mergeEventMediaForAppend(
  currentPending: File[],
  incoming: File[],
  serverMedia: { kind: string }[],
): { ok: true; next: File[] } | { ok: false; error: string } {
  if (incoming.length > MAX_MEDIA_UPLOAD_BATCH) {
    return { ok: false, error: `За один раз не более ${MAX_MEDIA_UPLOAD_BATCH} файлов` }
  }
  const serverN = serverMedia.length
  const slots = MAX_EVENT_MEDIA_TOTAL - serverN
  const next = [...currentPending, ...incoming]
  if (next.length > slots) {
    return { ok: false, error: `Можно добавить не более ${slots} файл(ов) (уже ${serverN} на сервере).` }
  }
  for (const f of next) {
    const c = classifyMediaFile(f)
    if (c === 'bad') {
      return { ok: false, error: 'Допустимы фото (JPEG, PNG, WebP, GIF) и видео MP4 или WebM' }
    }
    if (f.size > MAX_MEDIA_FILE_BYTES) {
      return { ok: false, error: 'Каждый файл не больше 50 МБ' }
    }
  }
  return { ok: true, next }
}

export type GalleryItemKind = { kind: string }

/** Лента профиля: без лимита по количеству; за один выбор не больше MAX_MEDIA_UPLOAD_BATCH; каждый файл до 50 МБ. */
export function mergeProfileGalleryPending(
  _existing: GalleryItemKind[],
  pending: File[],
  incoming: File[],
): { ok: true; next: File[] } | { ok: false; error: string } {
  if (incoming.length > MAX_MEDIA_UPLOAD_BATCH) {
    return { ok: false, error: `За один раз не более ${MAX_MEDIA_UPLOAD_BATCH} файлов` }
  }
  const next = [...pending, ...incoming]
  for (const f of next) {
    const c = classifyMediaFile(f)
    if (c === 'bad') {
      return { ok: false, error: 'Допустимы фото (JPEG, PNG, WebP, GIF) и видео MP4 или WebM' }
    }
    if (f.size > MAX_MEDIA_FILE_BYTES) {
      return { ok: false, error: 'Каждый файл не больше 50 МБ' }
    }
  }
  return { ok: true, next }
}
