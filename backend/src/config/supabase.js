import { createClient } from '@supabase/supabase-js'

import { env } from './env.js'

/**
 * Supabase client placeholder.
 *
 * No database logic yet — this module only wires up the client so the rest
 * of the backend can import `getSupabase()` when features are added.
 * It returns null until SUPABASE_URL and SUPABASE_ANON_KEY are set in .env.
 */

let client = null

function createSupabaseClient() {
  if (!env.isSupabaseConfigured) {
    return null
  }

  // The service-role key bypasses Row Level Security and must never be used
  // in the frontend. Prefer the anon key for now; key-scoped clients can be
  // added per-service later.
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function getSupabase() {
  if (client === null) {
    client = createSupabaseClient()
  }
  return client
}

export function requireSupabase() {
  const supabase = getSupabase()
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (see .env.example).'
    )
  }
  return supabase
}
