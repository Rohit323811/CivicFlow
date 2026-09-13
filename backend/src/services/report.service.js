import { getBackendClient } from '../config/supabase.js'
import { httpError } from '../utils/httpError.js'

const OBSERVATION_COLUMNS =
  'id, source, source_record_id, created_by, category, description, lat, lng, "timestamp", severity, confidence, evidence, created_at'

const ISSUE_COLUMNS =
  'id, category, description, lat, lng, severity, confidence, status, department_id, created_at, updated_at'

/**
 * Create a citizen report.
 *
 * The insert goes through the service-role client, but the row itself is
 * exactly what the citizen INSERT policy in the schema allows
 * (source = 'citizen_report', source_record_id null, created_by = caller),
 * so the same write would pass under the caller's own RLS. The database
 * trigger then auto-creates a 'potential' issue + link + history entry.
 *
 * Returns { observation, issue } — issue is the auto-created potential issue.
 */
export async function createReport(profileId, payload) {
  const backend = getBackendClient()
  if (!backend) {
    throw httpError(503, 'Supabase service client not configured (SUPABASE_SERVICE_ROLE_KEY)')
  }

  const observation = {
    source: 'citizen_report',
    created_by: profileId,
    category: payload.category,
    description: payload.description ?? null,
    lat: payload.lat,
    lng: payload.lng,
    severity: payload.severity ?? 'low',
    confidence: payload.confidence ?? 60,
    evidence: payload.evidence ?? {},
  }

  const { data: inserted, error } = await backend
    .from('observations')
    .insert(observation)
    .select(OBSERVATION_COLUMNS)
    .single()

  if (error) {
    throw httpError(400, `Could not create report: ${error.message}`)
  }

  // The trg_sync_new_issue trigger linked this observation to a new
  // 'potential' issue — fetch it so the reporter gets immediate feedback.
  const { data: link, error: linkError } = await backend
    .from('issue_observations')
    .select('issue_id')
    .eq('observation_id', inserted.id)
    .single()

  if (linkError || !link) {
    return { observation: inserted, issue: null }
  }

  const { data: issue, error: issueError } = await backend
    .from('issues')
    .select(ISSUE_COLUMNS)
    .eq('id', link.issue_id)
    .single()

  return { observation: inserted, issue: issueError ? null : issue }
}

/** Observations the given profile submitted ("my reports"). */
export async function listMyReports(profileId) {
  const backend = getBackendClient()
  if (!backend) {
    throw httpError(503, 'Supabase service client not configured (SUPABASE_SERVICE_ROLE_KEY)')
  }

  const { data, error } = await backend
    .from('observations')
    .select(OBSERVATION_COLUMNS)
    .eq('created_by', profileId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    throw httpError(500, `Could not load reports: ${error.message}`)
  }
  return data
}
