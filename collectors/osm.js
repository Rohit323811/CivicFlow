import { runCollector } from './collectorRunner.js'

/**
 * Stage 6 — OpenStreetMap collector.
 *
 * Queries the Overpass API for elements tagged hazard/note inside a bbox
 * and maps them into raw records for the OSM normalizer. Configuration
 * (see .env.example):
 *
 *   OSM_BBOX          "minLat,minLng,maxLat,maxLng" (default: Bengaluru area)
 *   OSM_OVERPASS_URL  optional endpoint override (default: overpass-api.de)
 */

const OVERPASS_DEFAULT = 'https://overpass-api.de/api/interpreter'

export function osmConfigFromEnv(env = process.env) {
  return {
    bbox: env.OSM_BBOX ?? '12.90,77.50,13.10,77.70',
    endpoint: env.OSM_OVERPASS_URL ?? OVERPASS_DEFAULT,
  }
}

export function validateOsmConfig(config) {
  const parts = String(config.bbox).split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error('OSM_BBOX must be "minLat,minLng,maxLat,maxLng"')
  }
  const [minLat, minLng, maxLat, maxLng] = parts
  if (minLat >= maxLat || minLng >= maxLng) {
    throw new Error('OSM_BBOX min values must be < max values')
  }
}

export function buildOverpassQuery(bbox) {
  const b = String(bbox).trim()
  return (
    `[out:json][timeout:25];(` +
    `node["hazard"](${b});` +
    `way["hazard"](${b});` +
    `node["note"](${b});` +
    `way["note"](${b});` +
    `);out center 200;`
  )
}

/** Map an Overpass JSON response into raw records for the OSM normalizer. */
export function mapOverpassElements(payload) {
  const elements = payload?.elements ?? []
  return elements
    .map((element) => ({
      id: element.id,
      type: element.type ?? 'node',
      lat: element.lat ?? element.center?.lat,
      lon: element.lon ?? element.center?.lon,
      tags: element.tags ?? {},
    }))
    .filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lon))
}

export async function fetchOsmRecords(config) {
  validateOsmConfig(config)

  const url = `${config.endpoint.replace(/\/$/, '')}?data=${encodeURIComponent(buildOverpassQuery(config.bbox))}`
  const response = await fetch(url, {
    headers: { 'user-agent': 'CivicFlow/0.1 (civic issue collector)' },
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    throw new Error(`overpass API responded ${response.status}`)
  }

  return mapOverpassElements(await response.json())
}

export function runOsmCollector(config = osmConfigFromEnv(), options = {}) {
  return runCollector({
    sourceName: 'openstreetmap',
    sourceType: 'osm',
    url: 'https://www.openstreetmap.org',
    fetchFn: () => fetchOsmRecords(config),
    ...options,
  })
}

// CLI entrypoint: node collectors/osm.js
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  runOsmCollector()
    .then((summary) => {
      // eslint-disable-next-line no-console
      console.log('[osm] done:', JSON.stringify(summary, null, 2))
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[osm] failed:', err.message)
      process.exitCode = 1
    })
}
