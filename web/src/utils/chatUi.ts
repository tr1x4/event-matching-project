/** Длительность для голосовых: `m:ss`. */
export function formatVoiceClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Парсинг `member_read_cursors` из метаданных чата (ключи — строковые profile_id). */
export function parseMemberReadCursors(
  meta: { member_read_cursors?: Record<string, number> } | null | undefined,
): Record<number, number> {
  const raw = meta?.member_read_cursors
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<number, number> = {}
  for (const [k, v] of Object.entries(raw)) {
    const id = Number.parseInt(k, 10)
    if (!Number.isFinite(id) || id <= 0) continue
    const n = typeof v === 'number' ? v : Number(v)
    out[id] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  }
  return out
}

/** Объединить курсоры прочитанного (не уменьшать значение при гонке с WS). */
export function mergeReadCursors(prev: Record<number, number>, incoming: Record<number, number>): Record<number, number> {
  const next = { ...prev }
  for (const [idStr, v] of Object.entries(incoming)) {
    const pid = Number(idStr)
    if (!Number.isFinite(pid)) continue
    next[pid] = Math.max(next[pid] ?? 0, v)
  }
  return next
}

/** Короткое время сообщения в чате (сегодня — только время, иначе дата + время). */
export function formatChatMessageTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
