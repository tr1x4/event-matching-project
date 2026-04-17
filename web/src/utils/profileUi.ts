/** Маска адреса для отображения до фокуса на поле. */
export function maskEmail(email: string): string {
  const t = email.trim()
  if (!t) return '…'
  const at = t.indexOf('@')
  if (at <= 0) return '••••••••'
  const user = t.slice(0, at)
  const domain = t.slice(at + 1)
  const keep = Math.min(2, user.length)
  const dots = Math.max(4, user.length - keep)
  return `${user.slice(0, keep)}${'•'.repeat(dots)}@${domain}`
}

export function ageFromBirthDate(iso: string | null | undefined): number | null {
  if (!iso || !String(iso).trim()) return null
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - d.getFullYear()
  const m = today.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1
  return age >= 0 && age < 130 ? age : null
}

export function ageWordRu(n: number): string {
  const m100 = n % 100
  if (m100 >= 11 && m100 <= 19) return 'лет'
  const m10 = n % 10
  if (m10 === 1) return 'год'
  if (m10 >= 2 && m10 <= 4) return 'года'
  return 'лет'
}

/** Одна буква: М / Ж */
export function genderLetterRu(gender: string | null | undefined): string {
  if (gender === 'male') return 'М'
  if (gender === 'female') return 'Ж'
  return '…'
}

/** Убирает типовые приставки/хвосты вроде «г.», «городской округ» из подписи города. */
export function displayCityName(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = raw.trim()
  s = s.replace(/\s*,?\s*городской\s+округ.*$/i, '').trim()
  s = s.replace(/^г\.?\s+/i, '').trim()
  s = s.replace(/\s+г\.?\s*$/i, '').trim()
  return s
}
