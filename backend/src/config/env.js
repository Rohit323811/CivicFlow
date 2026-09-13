/**
 * Centralized environment access. Reads from process.env (loaded via
 * `dotenv/config` in server.js). No validation requirements yet —
 * values are checked lazily where they are used.
 */

function optional(key) {
  const value = process.env[key]
  return value && value.trim().length > 0 ? value.trim() : undefined
}

const supabaseUrl = optional('SUPABASE_URL')
const supabaseAnonKey = optional('SUPABASE_ANON_KEY')
const supabaseServiceRoleKey = optional('SUPABASE_SERVICE_ROLE_KEY')

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,

  // Future integrations (unused for now)
  aiApiKey: optional('AI_API_KEY'),
  aiBaseUrl: optional('AI_BASE_URL'),
  aiModel: optional('AI_MODEL'),
  weatherApiKey: optional('WEATHER_API_KEY'),

  // Integration keys stay LIVE (read on each access) so tests and runtime
  // configuration changes are picked up without a process restart.
  get liveAiConfig() {
    return {
      aiApiKey: optional('AI_API_KEY'),
      aiBaseUrl: optional('AI_BASE_URL'),
      aiModel: optional('AI_MODEL'),
    }
  },

  get isSupabaseConfigured() {
    return Boolean(supabaseUrl && supabaseAnonKey)
  },

  get isServiceRoleConfigured() {
    return Boolean(supabaseUrl && supabaseServiceRoleKey)
  },
}
