import cron from 'node-cron'

import { runWeatherCollector, weatherConfigFromEnv } from './weather.js'
import { runOsmCollector, osmConfigFromEnv } from './osm.js'
import '../backend/src/config/loadEnv.js'

/**
 * Stage 6 — cron scheduler.
 *
 * Schedules the collectors (node-cron) and a periodic matching/AI sweep.
 * Cron expressions come from the environment (see .env.example); a collector
 * with an empty schedule is simply not scheduled.
 *
 * CLI: node collectors/scheduler.js
 */

const jobs = []

function log(...args) {
  // eslint-disable-next-line no-console
  console.log(`[scheduler ${new Date().toISOString()}]`, ...args)
}

async function safeRun(name, fn) {
  try {
    const summary = await fn()
    log(name, 'ok:', JSON.stringify(summary))
  } catch (err) {
    log(name, 'FAILED:', err.message)
  }
}

export function startScheduler(env = process.env) {
  const weatherConfig = weatherConfigFromEnv(env)
  const osmConfig = osmConfigFromEnv(env)

  const weatherSchedule = env.COLLECTOR_WEATHER_SCHEDULE ?? '0 */3 * * *' // every 3h
  const osmSchedule = env.COLLECTOR_OSM_SCHEDULE ?? '0 */6 * * *' // every 6h
  const sweepSchedule = env.MATCHING_SWEEP_SCHEDULE ?? '*/30 * * * *' // every 30min

  if (weatherConfig.apiKey) {
    jobs.push(
      cron.schedule(weatherSchedule, () => safeRun('[weather]', () => runWeatherCollector(weatherConfig)))
    )
    log(`weather collector scheduled: "${weatherSchedule}"`)
  } else {
    log('weather collector skipped: WEATHER_API_KEY not set')
  }

  jobs.push(cron.schedule(osmSchedule, () => safeRun('[osm]', () => runOsmCollector(osmConfig))))
  log(`osm collector scheduled: "${osmSchedule}"`)

  if (env.MATCHING_SWEEP_ENABLED !== 'false') {
    jobs.push(
      cron.schedule(sweepSchedule, async () => {
        const { matchUnlinkedObservations } = await import('../backend/src/services/matching.service.js')
        const { analyzePendingIssues } = await import('../backend/src/services/aiAnalysis.service.js')
        await safeRun('[matching]', () => matchUnlinkedObservations())
        await safeRun('[ai-sweep]', () => analyzePendingIssues(25))
      })
    )
    log(`matching/AI sweep scheduled: "${sweepSchedule}"`)
  }

  return jobs
}

export function stopScheduler() {
  jobs.forEach((job) => job.stop())
  jobs.length = 0
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  log('starting CivicFlow collector scheduler...')
  startScheduler()
}
