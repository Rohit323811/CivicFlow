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
const aiBaseUrl = optional('AI_BASE_URL') ?? 'https://api.x.ai/v1'
const aiModel = optional('AI_MODEL') ?? 'grok-4.3'

export const env = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  supabaseUrl,
  supabaseAnonKey,
  supabaseServiceRoleKey,

  // Optional xAI/Grok integration. Heuristics remain the fallback when no key
  // is configured or the provider request fails.
  aiApiKey: optional('AI_API_KEY'),
  aiBaseUrl,
  aiModel,
  weatherApiKey: optional('WEATHER_API_KEY'),

  // Integration keys stay LIVE (read on each access) so tests and runtime
  // configuration changes are picked up without a process restart.
  get liveAiConfig() {
    return {
      aiApiKey: optional('AI_API_KEY'),
      aiBaseUrl: optional('AI_BASE_URL') ?? 'https://api.x.ai/v1',
      aiModel: optional('AI_MODEL') ?? 'grok-4.3',
    }
  },

  get isSupabaseConfigured() {
    return Boolean(supabaseUrl && supabaseAnonKey)
  },

  get isServiceRoleConfigured() {
    return Boolean(supabaseUrl && supabaseServiceRoleKey)
  },
}
