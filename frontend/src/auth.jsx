import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

/**
 * Supabase browser client (anon key only).
 *
 * SECURITY: only the anon key ever reaches the frontend. The service-role
 * key stays in the backend; all privileged writes go through the Express API
 * (VITE_API_URL), which enforces roles on every action.
 */

let client = null

function getClient() {
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const supabase = getClient()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => sub.subscription.unsubscribe()
  }, [supabase])

  // Load the app profile (role) for the signed-in user.
  useEffect(() => {
    if (!session) {
      setProfile(null)
      return
    }
    getClient()
      .from('profiles')
      .select('id, role, name, email')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data))
  }, [session])

  const value = useMemo(
    () => ({
      supabase,
      session,
      user: session?.user ?? null,
      profile, // { id, role, name, email } | null
      isAuthority: profile?.role === 'authority' || profile?.role === 'admin',
      isAdmin: profile?.role === 'admin',
      loading,
      signOut: () => supabase.auth.signOut(),
    }),
    [supabase, session, profile, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

/** Authenticated fetch helper for the CivicFlow API. */
export async function apiFetch(path, { method = 'GET', body, session } = {}) {
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
  const headers = { 'content-type': 'application/json' }
  if (session?.access_token) {
    headers.authorization = `Bearer ${session.access_token}`
  }

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error ?? `Request failed (${res.status})`)
  }
  return data
}
