/** Длительность в днях (как на бэкенде) — для подсказок на клиенте */

const DURATION_DAYS: Record<string, number> = {
  d1: 1,
  d2: 2,
  d3: 3,
  d4: 4,
  d5: 5,
  d6: 6,
  week: 7,
  longer: 30,
}

/** Прошло ли больше дней с начала, чем в выбранной длительности (ориентир «могло завершиться»). */
export function eventPastExpectedDuration(
  startsAt: string | null | undefined,
  durationKey: string | null | undefined,
): boolean {
  if (!startsAt?.trim()) return false
  const start = new Date(startsAt)
  if (Number.isNaN(start.getTime())) return false
  const dk = durationKey && durationKey in DURATION_DAYS ? durationKey : 'd1'
  const days = DURATION_DAYS[dk] ?? 1
  const end = start.getTime() + days * 86400000
  return Date.now() > end
}
