import { normalizeWeatherAlert } from './weather.js'
import { normalizeOsmRecord } from './osm.js'

/**
 * Registry: source type -> normalizer. Stage 6 collectors call
 * normalizeRecord(sourceType, raw) and get canonical observations back.
 */
const NORMALIZERS = {
  weather: normalizeWeatherAlert,
  osm: normalizeOsmRecord,
}

export function normalizeRecord(sourceType, raw) {
  const normalizer = NORMALIZERS[sourceType]
  if (!normalizer) {
    throw new Error(`No normalizer registered for source type: ${sourceType}`)
  }
  return normalizer(raw)
}

export function registeredSourceTypes() {
  return Object.keys(NORMALIZERS)
}

export { normalizeWeatherAlert, normalizeOsmRecord }
