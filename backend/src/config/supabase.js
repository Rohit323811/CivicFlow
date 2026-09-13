import { createClient } from '@supabase/supabase-js'

import { env } from './env.js'

/**
 * Supabase client factory.
 *
 * Three kinds of clients, with very different privileges:
 *
 *  1. getSupabase()          — anon key. Used for health checks only.
 *  2. getBackendClient()     — SERVICE ROLE. Bypasses Row Level Security.
 *                              Backend-only; the key must never reach the
 *                              frontend, bundle, or client responses.
 *  3. getSupabaseWithAuth()  — fresh client carrying the caller's JWT so
 *                              PostgREST enforces that user's RLS policies.
 *
 * Test hooks (__setBackendClientForTests / __setAuthClientForTests) let the
 * unit tests inject mocks instead of talking to a real Supabase instance.
 */

let anonClient = null
let serviceClient = null
let backendTestOverride = null
let authTestOverride = null

export function getSupabase() {
  if (!env.isSupabaseConfigured) {
    return null
  }
  if (anonClient === null) {
    anonClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return anonClient
}

export function getBackendClient() {
  if (backendTestOverride) {
    return backendTestOverride
  }
  if (!env.isServiceRoleConfigured) {
    return null
  }
  if (serviceClient === null) {
    serviceClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return serviceClient
}

export function getSupabaseWithAuth(jwt) {
  if (authTestOverride) {
    return authTestOverride
  }
  if (!env.isSupabaseConfigured || !jwt) {
    return null
  }
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
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

// ---------------------------------------------------------------------------
// Test-only injection (never call from application code)
// ---------------------------------------------------------------------------
export function __setBackendClientForTests(client) {
  backendTestOverride = client
}

export function __resetBackendClientForTests() {
  backendTestOverride = null
}

export function __setAuthClientForTests(client) {
  authTestOverride = client
}

export function __resetAuthClientForTests() {
  authTestOverride = null
}
