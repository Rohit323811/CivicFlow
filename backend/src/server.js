import 'dotenv/config'

import app from './app.js'
import { env } from './config/env.js'

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`CivicFlow API listening on http://localhost:${env.port}`)
  if (!env.isSupabaseConfigured) {
    // eslint-disable-next-line no-console
    console.warn('Supabase env vars not set yet — /api/health will report supabase: "not_configured"')
  }
})

export default server
