import cron from 'node-cron'
import { runWeatherCollector } from '../../collectors/weather.collector.js'
import { runOsmCollector } from '../../collectors/osm.collector.js'

export function startCollectorScheduler() {
  console.log('[Scheduler] Starting automated collector cron jobs...')

  // Weather collector runs every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      console.log('[Scheduler] Executing Weather API collector...')
      const res = await runWeatherCollector()
      console.log(`[Scheduler] Weather collector completed. Fetched ${res.records_fetched} records.`)
    } catch (err) {
      console.error('[Scheduler] Error running Weather collector:', err.message)
    }
  })

  // OpenStreetMap collector runs every hour
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('[Scheduler] Executing OpenStreetMap collector...')
      const res = await runOsmCollector()
      console.log(`[Scheduler] OSM collector completed. Fetched ${res.records_fetched} records.`)
    } catch (err) {
      console.error('[Scheduler] Error running OSM collector:', err.message)
    }
  })
}
