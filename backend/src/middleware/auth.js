import { getBackendClient, getSupabaseWithAuth } from '../config/supabase.js'

const ROLE_RANK = { citizen: 1, authority: 2, admin: 3 }

async function authenticate(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) {
    return { user: null, error: 'missing_token' }
  }

  const client = getSupabaseWithAuth(token)
  if (!client) {
    return { user: null, error: 'auth_unconfigured' }
  }

  const { data, error } = await client.auth.getUser()
  if (error || !data?.user) {
    return { user: null, error: 'invalid_token' }
  }
  return { user: data.user }
}

async function loadProfile(userId) {
  const backend = getBackendClient()
  if (!backend) {
    return { error: 'backend_unconfigured' }
  }
  const { data, error } = await backend
    .from('profiles')
    .select('id, role, name, email')
    .eq('user_id', userId)
    .single()
  if (error || !data) {
    return { error: 'profile_missing' }
  }
  return { profile: data }
}

/**
 * Require a valid Supabase JWT and an existing profile.
 * On success, sets req.user = { id, email, profile }.
 */
export async function requireAuth(req, res, next) {
  const { user, error } = await authenticate(req)

  if (!user) {
    if (error === 'missing_token') {
      return res.status(401).json({ error: 'Authentication required' })
    }
    if (error === 'auth_unconfigured') {
      return res.status(503).json({ error: 'Auth is not configured (SUPABASE_URL / SUPABASE_ANON_KEY)' })
    }
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { profile, error: profileError } = await loadProfile(user.id)
  if (!profile) {
    if (profileError === 'backend_unconfigured') {
      return res.status(503).json({ error: 'Supabase service client not configured (SUPABASE_SERVICE_ROLE_KEY)' })
    }
    return res.status(403).json({ error: 'Profile not provisioned for this user' })
  }

  req.user = { id: user.id, email: user.email ?? null, profile }
  next()
}

/**
 * Role gate with hierarchy: admin passes authority checks, authority passes
 * citizen checks. Must run after requireAuth.
 */
export function requireRole(minimumRole) {
  const minimum = ROLE_RANK[minimumRole]
  if (!minimum) {
    throw new Error(`Unknown role: ${minimumRole}`)
  }
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    const rank = ROLE_RANK[req.user.profile.role] ?? 0
    if (rank < minimum) {
      return res.status(403).json({ error: `This action requires the ${minimumRole} role` })
    }
    next()
  }
}

/**
 * Best-effort identity attach for public endpoints: attaches req.user when a
 * valid token + profile exist, never rejects. Used by public issue reads so
 * services can hide authority-only rows from non-authority viewers.
 */
export async function optionalAuth(req, res, next) {
  try {
    const { user } = await authenticate(req)
    if (user) {
      const { profile } = await loadProfile(user.id)
      if (profile) {
        req.user = { id: user.id, email: user.email ?? null, profile }
      }
    }
  } catch {
    // optional — ignore auth failures on public endpoints
  }
  next()
}

export function hasRole(req, minimumRole) {
  if (!req.user) return false
  return (ROLE_RANK[req.user.profile.role] ?? 0) >= ROLE_RANK[minimumRole]
}
