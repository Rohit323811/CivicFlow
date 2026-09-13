import { env } from '../config/env.js'
import { getSupabase } from '../config/supabase.js'

/**
 * GET /api/health
 * Liveness probe. Reports whether env-driven integrations are configured.
 * No database calls yet — that comes with real Supabase wiring.
 */
export function getHealth(req, res) {
  res.json({
    status: 'ok',
    service: 'civicflow-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    supabase: getSupabase() ? 'configured' : 'not_configured',
  })
}
