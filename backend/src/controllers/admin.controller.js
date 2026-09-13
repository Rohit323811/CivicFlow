import { getBackendClient } from '../config/supabase.js'
import { httpError, asyncHandler } from '../utils/httpError.js'

function getClient() {
  const backend = getBackendClient()
  if (!backend) {
    throw httpError(503, 'Supabase service client not configured (SUPABASE_SERVICE_ROLE_KEY)')
  }
  return backend
}

/** GET /api/departments — reference list (any authenticated user). */
export const getDepartments = asyncHandler(async (req, res) => {
  const { data, error } = await getClient()
    .from('departments')
    .select('id, name, contact')
    .order('name', { ascending: true })

  if (error) throw httpError(500, `Could not load departments: ${error.message}`)
  res.json({ departments: data ?? [] })
})

/** GET /api/admin/users — profiles list (admin only). */
export const listUsers = asyncHandler(async (req, res) => {
  const { data, error } = await getClient()
    .from('profiles')
    .select('id, user_id, role, name, email, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw httpError(500, `Could not load users: ${error.message}`)
  res.json({ users: data ?? [] })
})

/** GET /api/admin/data-sources — source registry (admin only). */
export const listDataSources = asyncHandler(async (req, res) => {
  const { data, error } = await getClient()
    .from('data_sources')
    .select('id, name, type, url, reliability_score, created_at')
    .order('name', { ascending: true })

  if (error) throw httpError(500, `Could not load data sources: ${error.message}`)
  res.json({ sources: data ?? [] })
})
