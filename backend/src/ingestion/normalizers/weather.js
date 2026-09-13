import { normalizeCategory } from '../categoryMap.js'
import { normalizeObservation } from '../observationSchema.js'

/**
 * Weather normalizer (Stage 3 / consumed by the Stage 6 collector).
 *
 * Accepts OpenWeather One Call "alerts"-style records:
 * { event, description, start, end, lat, lon, sender_name }
 * or a simplified { category, description, lat, lng, severity, timestamp }.
 */
export function normalizeWeatherAlert(raw) {
  const record = {
    category: raw.category ?? mapWeatherEvent(raw.event),
    description: raw.description ?? raw.event ?? null,
    lat: raw.lat ?? raw.latitiude ?? raw.latitude,
    lng: raw.lng ?? raw.lon ?? raw.longitude,
    severity: raw.severity ?? mapWeatherSeverity(raw.event, raw.tags),
    timestamp: raw.timestamp ?? raw.start ?? null,
    confidence: raw.confidence ?? 55,
    evidence: {
      provider: raw.sender_name ?? raw.provider ?? 'weather',
      event: raw.event ?? null,
      ends_at: raw.end ?? null,
      tags: raw.tags ?? [],
    },
  }

  return normalizeObservation(record, { source: 'weather', sourceRecordId: raw.id ?? null })
}

function mapWeatherEvent(event) {
  const key = String(event ?? '').toLowerCase()
  if (key.includes('flood')) return 'FLOODING'
  if (key.includes('rain')) return 'FLOODING'
  if (key.includes('drain')) return 'DRAINAGE'
  if (key.includes('storm')) return 'FLOODING'
  return 'OTHER'
}

function mapWeatherSeverity(event, tags = []) {
  const text = `${event ?? ''} ${tags.join(' ')}`.toLowerCase()
  if (text.includes('extreme') || text.includes('catastrophic')) return 'critical'
  if (text.includes('severe') || text.includes('major')) return 'high'
  if (text.includes('moderate')) return 'medium'
  return 'low'
}

export { normalizeCategory }
