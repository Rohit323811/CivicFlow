/**
 * Common Observation schema (Stage 3).
 *
 * Every source's raw record is normalized into this shape before it can be
 * stored in `observations` or participate in dedup/geospatial matching:
 *
 * {
 *   source, source_record_id, created_by?, category, description,
 *   lat, lng, timestamp (ISO string), severity, confidence (0..100), evidence
 * }
 */
import { normalizeCategory } from './categoryMap.js'

const SEVERITY_VALUES = new Set(['low', 'medium', 'high', 'critical'])
const SOURCE_TYPES = new Set(['citizen_report', 'government', 'weather', 'osm', 'ai', 'other'])

export class ObservationValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ObservationValidationError'
  }
}

function clampConfidence(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 50
  return Math.min(100, Math.max(0, Math.round(num * 100) / 100))
}

function normalizeSeverity(value) {
  const key = String(value ?? 'low').toLowerCase().trim()
  if (SEVERITY_VALUES.has(key)) return key
  if (['1', 'minor'].includes(key)) return 'low'
  if (['2', 'moderate'].includes(key)) return 'medium'
  if (['3', 'major'].includes(key)) return 'high'
  if (['4', 'severe', 'extreme'].includes(key)) return 'critical'
  return 'low'
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === '') {
    return new Date().toISOString()
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new ObservationValidationError(`invalid timestamp: ${value}`)
  }
  return date.toISOString()
}

/**
 * Validate + normalize one raw record into a canonical observation.
 * Throws ObservationValidationError on unusable input (bad coords, missing
 * category). category/severity are normalized; confidence clamped to 0..100.
 */
export function normalizeObservation(raw, { source, sourceRecordId = null, createdBy = null } = {}) {
  if (!source || !SOURCE_TYPES.has(source)) {
    throw new ObservationValidationError(`unknown source: ${source}`)
  }

  const category = normalizeCategory(raw.category)
  if (!category) {
    throw new ObservationValidationError('category is required')
  }

  const lat = Number(raw.lat)
  const lng = Number(raw.lng)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new ObservationValidationError(`invalid lat: ${raw.lat}`)
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new ObservationValidationError(`invalid lng: ${raw.lng}`)
  }

  const evidence = raw.evidence && typeof raw.evidence === 'object' && !Array.isArray(raw.evidence)
    ? raw.evidence
    : {}

  return {
    source,
    source_record_id: sourceRecordId !== undefined ? sourceRecordId : (raw.source_record_id ?? null),
    created_by: createdBy,
    category,
    description: raw.description != null ? String(raw.description).slice(0, 2000) : null,
    lat,
    lng,
    timestamp: normalizeTimestamp(raw.timestamp),
    severity: normalizeSeverity(raw.severity),
    confidence: clampConfidence(raw.confidence),
    evidence,
  }
}

/** Normalize a batch; invalid records are reported, not thrown. */
export function normalizeBatch(rawRecords, options) {
  const observations = []
  const errors = []
  rawRecords.forEach((raw, index) => {
    try {
      observations.push(normalizeObservation(raw, options))
    } catch (err) {
      errors.push({ index, message: err.message })
    }
  })
  return { observations, errors }
}
