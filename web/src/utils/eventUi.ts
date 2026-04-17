import type { EventDurationKey, EventLifecycleStatus, ParticipantBucket } from '../api/client'

const DUR_LABELS: Record<EventDurationKey, string> = {
  d1: '1 день',
  d2: '2 дня',
  d3: '3 дня',
  d4: '4 дня',
  d5: '5 дней',
  d6: '6 дней',
  week: 'Неделя',
  longer: 'Более недели',
}

const BUCKET_LABELS: Record<ParticipantBucket, string> = {
  p2: '2 человека',
  p3_4: '3-4 человека',
  p5_9: '5-9 человек',
  p10_plus: '10 и более',
}

const STATUS_LABELS: Record<EventLifecycleStatus, string> = {
  planned: 'Запланировано',
  active: 'Началось',
  completed: 'Завершено',
}

export function durationLabel(key: string | null | undefined): string {
  if (!key) return 'нет'
  return DUR_LABELS[key as EventDurationKey] ?? key
}

export function participantBucketLabel(bucket: string | null | undefined): string {
  if (!bucket) return 'нет'
  return BUCKET_LABELS[bucket as ParticipantBucket] ?? bucket
}

/** Текст для карточек списков: ожидаемый размер группы при создании. */
export function participantBucketApproxLine(bucket: string | null | undefined): string {
  return `~ ${participantBucketLabel(bucket)}`
}

export function eventStatusLabel(status: string | null | undefined): string {
  if (!status) return 'нет'
  return STATUS_LABELS[status as EventLifecycleStatus] ?? status
}

/** Убирает « г.» из типичного вывода ru-RU (нап. «17 апр. 2026 г., 09:00»). */
function stripRussianYearSuffix(s: string): string {
  return s.replace(/\s*г\./g, '')
}

export function formatEventDateTime(iso: string | null | undefined): string {
  if (!iso) return 'нет'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const raw = d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return stripRussianYearSuffix(raw)
}

/** Участники в списке: организатор + участники без дубликатов. */
export function eventParticipantListCount(model: {
  participants?: number[] | null
  creator_profile_id?: number | null
}): number {
  const parts = (model.participants ?? []).map(Number).filter((n) => Number.isFinite(n))
  const set = new Set(parts)
  const c = model.creator_profile_id
  if (c != null && Number.isFinite(Number(c))) set.add(Number(c))
  return set.size
}
