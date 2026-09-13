import { runCollector } from './collectorRunner.js'

/**
 * Stage 6 — Weather API collector.
 *
 * Fetches active weather alerts from an OpenWeather-compatible One Call
 * endpoint and maps them into raw records for the pipeline. Configuration
 * comes from the environment (see .env.example):
 *
 *   WEATHER_API_KEY        required
 *   WEATHER_LAT / WEATHER_LNG   coordinates to watch (required)
 *   WEATHER_ONECALL_URL    optional endpoint override
 *                          (default: data/2.5/onecall on api.openweathermap.org)
 */

export function weatherConfigFromEnv(env = process.env) {
  return {
    apiKey: env.WEATHER_API_KEY ?? null,
    lat: Number(env.WEATHER_LAT),
    lng: Number(env.WEATHER_LNG),
    endpoint: env.WEATHER_ONECALL_URL ?? 'https://api.openweathermap.org/data/2.5/onecall',
  }
}

export function validateWeatherConfig(config) {
  if (!config.apiKey) {
    throw new Error('WEATHER_API_KEY is not set (see .env.example)')
  }
  if (!Number.isFinite(config.lat) || !Number.isFinite(config.lng)) {
    throw new Error('WEATHER_LAT and WEATHER_LNG must be set to valid coordinates')
  }
}

/** Map a One Call response into raw records for the weather normalizer. */
export function mapOpenWeatherAlerts(payload) {
  const alerts = payload?.alerts ?? []
  return alerts.map((alert) => ({
    id: `ow/alert/${alert.event ?? 'unknown'}/${alert.start ?? ''}`,
    event: alert.event ?? null,
    description: alert.description ?? null,
    sender_name: alert.sender_name ?? null,
    start: alert.start != null ? new Date(alert.start * 1000).toISOString() : null,
    end: alert.end != null ? new Date(alert.end * 1000).toISOString() : null,
    tags: alert.tags ?? [],
    lat: payload.lat,
    lng: payload.lon,
  }))
}

export async function fetchWeatherAlerts(config) {
  validateWeatherConfig(config)

  const url = `${config.endpoint.replace(/\/$/, '')}?lat=${config.lat}&lon=${config.lng}&appid=${config.apiKey}`

  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) {
    throw new Error(`weather API responded ${response.status}`)
  }

  return mapOpenWeatherAlerts(await response.json())
}

export function runWeatherCollector(config = weatherConfigFromEnv(), options = {}) {
  return runCollector({
    sourceName: 'openweather',
    sourceType: 'weather',
    url: 'https://openweathermap.org/api',
    fetchFn: () => fetchWeatherAlerts(config),
    ...options,
  })
}

// CLI entrypoint: node collectors/weather.js
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  runWeatherCollector()
    .then((summary) => {
      // eslint-disable-next-line no-console
      console.log('[weather] done:', JSON.stringify(summary, null, 2))
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[weather] failed:', err.message)
      process.exitCode = 1
    })
}
