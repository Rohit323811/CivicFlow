import { normalizeObservation } from '../observationSchema.js'

/**
 * OpenStreetMap normalizer (Stage 3 / consumed by the Stage 6 collector).
 *
 * Accepts OSM note or element records:
 * notes:     { id, lat, lon, text, date_created }
 * elements:  { type, id, lat, lon, tags: { hazard, highway, note, ... } }
 */
export function normalizeOsmRecord(raw) {
  const tags = raw.tags ?? {}
  const text = raw.text ?? tags.note ?? tags.description ?? null

  const record = {
    category: mapOsmTags(tags, text),
    description: text,
    lat: raw.lat ?? tags.lat,
    lng: raw.lon ?? raw.lng ?? tags.lon,
    timestamp: raw.timestamp ?? raw.date_created ?? tags.check_date ?? null,
    severity: mapOsmSeverity(tags, text),
    confidence: 65,
    evidence: {
      osm_type: raw.type ?? null,
      osm_id: raw.id ?? null,
      hazard: tags.hazard ?? null,
      highway: tags.highway ?? null,
      raw_tags: tags,
    },
  }

  const sourceRecordId = raw.id != null ? `${raw.type ?? 'node'}/${raw.id}` : null
  return normalizeObservation(record, { source: 'osm', sourceRecordId })
}

function mapOsmTags(tags, text) {
  const haystack = [tags.hazard, tags.highway, tags.note, tags.description, text]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (haystack.includes('pothole') || haystack.includes('pot hole')) return 'ROAD_DAMAGE'
  if (tags.hazard === 'hole' || haystack.includes('road damage') || haystack.includes('crack')) {
    return 'ROAD_DAMAGE'
  }
  if (haystack.includes('flood')) return 'FLOODING'
  if (haystack.includes('drain') || haystack.includes('manhole')) return 'DRAINAGE'
  if (haystack.includes('leak') || haystack.includes('water main')) return 'WATER_LEAK'
  if (haystack.includes('garbage') || haystack.includes('trash') || haystack.includes('dumping')) {
    return 'GARBAGE'
  }
  if (haystack.includes('street lamp') || haystack.includes('street light') || tags.highway === 'street_lamp') {
    return 'STREETLIGHT'
  }
  if (haystack.includes('traffic signal') || haystack.includes('traffic light')) return 'TRAFFIC_SIGNAL'
  if (haystack.includes('sign')) return 'DAMAGED_SIGN'
  return 'OTHER'
}

function mapOsmSeverity(tags, text) {
  const haystack = `${tags.hazard ?? ''} ${text ?? ''}`.toLowerCase()
  if (haystack.includes('dangerous') || haystack.includes('deep')) return 'high'
  return 'low'
}
