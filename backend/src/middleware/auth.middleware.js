import { getSupabase } from '../config/supabase.js'

/**
 * Middleware to authenticate user via Supabase JWT.
 * Reads Bearer token from Authorization header.
 * Attaches req.user = { id, email, role, ... } if valid.
 */
export async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' })
    }

    const supabase = getSupabase()
    if (!supabase) {
      // In development/testing without real Supabase connection, mock or return error
      return res.status(500).json({ error: 'Supabase client is not configured.' })
    }

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired authentication token.' })
    }

    // Fetch profile role from public.profiles database table using authenticated user client context
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, name')
      .eq('id', user.id)
      .single()

    req.user = {
      id: user.id,
      email: user.email,
      role: profile?.role || user.user_metadata?.role || user.app_metadata?.role || 'citizen',
      name: profile?.name || user.user_metadata?.name || null,
    }

    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Middleware for optional authentication.
 * If token is present, verifies user and attaches req.user.
 * If token is missing, allows request to proceed with req.user = null.
 */
export async function optionalAuthenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null

    if (!token) {
      req.user = null
      return next()
    }

    const supabase = getSupabase()
    if (!supabase) {
      req.user = null
      return next()
    }

    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      req.user = null
      return next()
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, name')
      .eq('id', user.id)
      .single()

    req.user = {
      id: user.id,
      email: user.email,
      role: profile?.role || user.user_metadata?.role || user.app_metadata?.role || 'citizen',
      name: profile?.name || user.user_metadata?.name || null,
    }

    next()
  } catch (err) {
    req.user = null
    next()
  }
}

/**
 * Role-based authorization middleware generator.
 * Example: requireRole('authority', 'admin')
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' })
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}`,
      })
    }

    next()
  }
}
