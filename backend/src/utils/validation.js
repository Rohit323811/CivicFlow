/**
 * Request validation helpers. Each failure throws an httpError(400) that the
 * centralized error handler turns into a JSON response.
 */
import { httpError } from './httpError.js'

// Mirrors the issue_category domain in supabase/migrations/0001_initial_schema.sql
export const CATEGORY_VALUES = [
  'ROAD_DAMAGE',
  'WATER_LEAK',
  'STREETLIGHT',
  'GARBAGE',
  'FLOODING',
  'DRAINAGE',
  'TRAFFIC_SIGNAL',
  'DAMAGED_SIGN',
  'OTHER',
]

// Mirrors severity_level
export const SEVERITY_VALUES = ['low', 'medium', 'high', 'critical']

// Mirrors issue_status
export const ISSUE_STATUS_VALUES = [
  'potential',
  'verified',
  'assigned',
  'in_progress',
  'resolved',
  'rejected',
  'merged',
]

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body?.[f] === undefined || body?.[f] === null || body?.[f] === '')
  if (missing.length > 0) {
    throw httpError(400, `Missing required field(s): ${missing.join(', ')}`)
  }
}

export function requireNumber(body, field) {
  const value = Number(body?.[field])
  if (!Number.isFinite(value)) {
    throw httpError(400, `${field} must be a number`)
  }
  return value
}

export function requireEnum(body, field, allowed) {
  if (!allowed.includes(body?.[field])) {
    throw httpError(400, `${field} must be one of: ${allowed.join(', ')}`)
  }
  return body[field]
}

export function requireEnumIfPresent(body, field, allowed) {
  if (body?.[field] === undefined) return undefined
  return requireEnum(body, field, allowed)
}

/**
 * Parse geographic bounds from query params:
 * ?minLat=&minLng=&maxLat=&maxLng= — returns null when absent/incomplete.
 */
export function parseBounds(query) {
  const keys = ['minLat', 'minLng', 'maxLat', 'maxLng']
  const raw = keys.map((k) => query?.[k])
  if (raw.some((v) => v === undefined || v === null || v === '')) {
    return null
  }
  const [minLat, minLng, maxLat, maxLng] = raw.map(Number)
  return { minLat, minLng, maxLat, maxLng }
}
