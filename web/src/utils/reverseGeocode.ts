/** Обратное геокодирование (OSM Nominatim). Только для отображения адреса на карточках. */

const UA = 'EventMatchingDiploma/1.0 (student project)'

export async function reverseGeocodeAddressRu(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&format=json&accept-language=ru`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const j = (await res.json()) as { display_name?: string; address?: Record<string, string> }
    const a = j.address
    if (a) {
      const road = [a.road, a.house_number].filter(Boolean).join(' ').trim()
      const place = [a.city || a.town || a.village || a.hamlet, a.state].filter(Boolean).join(', ').trim()
      const line = [road, place].filter(Boolean).join(' · ')
      if (line) return line.slice(0, 220)
    }
    const dn = (j.display_name || '').trim()
    return dn ? dn.slice(0, 220) : null
  } catch {
    return null
  }
}
