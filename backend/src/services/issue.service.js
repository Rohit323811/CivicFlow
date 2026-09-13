import { getBackendClient } from '../config/supabase.js'
import { httpError } from '../utils/httpError.js'
import { assertTransition, TransitionError } from './statusTransitions.js'

const ISSUE_COLUMNS =
  'id, category, description, lat, lng, severity, confidence, status, department_id, created_at, updated_at'

// Statuses visible to citizens / anonymous users. 'potential', 'rejected'
// and 'merged' stay authority-internal (mirrors the RLS public policy).
const PUBLIC_STATUSES = ['verified', 'assigned', 'in_progress', 'resolved']

const AUTHORITY_STATUSES = ['potential', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected', 'merged']

function getClient() {
  const backend = getBackendClient()
  if (!backend) {
    throw httpError(503, 'Supabase service client not configured (SUPABASE_SERVICE_ROLE_KEY)')
  }
  return backend
}

function validateBounds(bounds) {
  if (!bounds) return null
  const { minLat, minLng, maxLat, maxLng } = bounds
  const defined = [minLat, minLng, maxLat, maxLng].every((v) => typeof v === 'number' && Number.isFinite(v))
  if (!defined) return null
  if (minLat > maxLat || minLng > maxLng) {
    throw httpError(400, 'Invalid bounds: min values must be <= max values')
  }
  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) {
    throw httpError(400, 'Invalid bounds: latitude [-90, 90], longitude [-180, 180]')
  }
  return { minLat, minLng, maxLat, maxLng }
}

/**
 * List issues with optional filters. Viewers below authority rank only ever
 * see PUBLIC_STATUSES rows, regardless of requested status filter.
 */
export async function listIssues(filters = {}, viewerRole = null) {
  // Validate input before touching the client so bad requests fail with 400
  // even when the database is not configured.
  const bounds = validateBounds(filters.bounds)
  const backend = getClient()

  const isAuthority = viewerRole === 'authority' || viewerRole === 'admin'
  const allowedStatuses = isAuthority ? AUTHORITY_STATUSES : PUBLIC_STATUSES

  let status = filters.status && allowedStatuses.includes(filters.status) ? filters.status : null
  if (!status && !isAuthority) {
    // public list: constrain to the public set (no IN support needed —
    // fetch non-terminal rows then filter in-memory keeps the mock/testable
    // query shape simple; volumes here are small)
  }

  let query = backend.from('issues').select(ISSUE_COLUMNS)
  if (filters.category) query = query.eq('category', filters.category)
  if (filters.severity) query = query.eq('severity', filters.severity)
  if (status) query = query.eq('status', status)

  if (bounds) {
    query = query
      .gte('lat', bounds.minLat)
      .lte('lat', bounds.maxLat)
      .gte('lng', bounds.minLng)
      .lte('lng', bounds.maxLng)
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(filters.limit ?? 200)

  if (error) {
    throw httpError(500, `Could not list issues: ${error.message}`)
  }

  let rows = data ?? []
  if (!status) {
    rows = rows.filter((row) => allowedStatuses.includes(row.status))
  }
  return rows
}

/** Issue detail with observations, history, and verification events. */
export async function getIssueDetail(issueId, viewerRole = null) {
  const backend = getClient()

  const { data: issue, error } = await backend.from('issues').select(ISSUE_COLUMNS).eq('id', issueId).single()

  if (error || !issue) {
    throw httpError(404, 'Issue not found')
  }

  const isAuthority = viewerRole === 'authority' || viewerRole === 'admin'
  if (!isAuthority && !PUBLIC_STATUSES.includes(issue.status)) {
    // 404 (not 403) to avoid leaking the existence of authority-internal rows
    throw httpError(404, 'Issue not found')
  }

  const [observationsRes, historyRes, verificationsRes] = await Promise.all([
    backend
      .from('issue_observations')
      .select('observations(*)')
      .eq('issue_id', issueId)
      .order('observation_id', { ascending: true }),
    backend.from('issue_history').select('*').eq('issue_id', issueId).order('created_at', { ascending: false }),
    backend
      .from('verification_events')
      .select('*')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: false }),
  ])

  return {
    issue,
    observations: (observationsRes.data ?? []).map((row) => row.observations).filter(Boolean),
    history: historyRes.data ?? [],
    verificationEvents: verificationsRes.data ?? [],
  }
}

/**
 * Authority verification action.
 * decision: 'verified' | 'rejected' | 'merged'
 */
export async function verifyIssue(issueId, actorProfileId, decision, { notes = null, mergeIntoIssueId = null } = {}) {
  const backend = getClient()

  if (!['verified', 'rejected', 'merged'].includes(decision)) {
    throw httpError(400, "decision must be one of 'verified', 'rejected', 'merged'")
  }

  const { data: issue, error } = await backend.from('issues').select(ISSUE_COLUMNS).eq('id', issueId).single()
  if (error || !issue) {
    throw httpError(404, 'Issue not found')
  }

  if (decision === 'merged') {
    if (!mergeIntoIssueId) {
      throw httpError(400, 'mergeIntoIssueId is required when decision is "merged"')
    }
    if (mergeIntoIssueId === issueId) {
      throw httpError(400, 'An issue cannot be merged into itself')
    }
    return mergeIssue(issue, mergeIntoIssueId, actorProfileId, notes)
  }

  assertTransition(issue.status, decision) // 'verified' | 'rejected'

  const { data: updated, error: updateError } = await backend
    .from('issues')
    .update({ status: decision })
    .eq('id', issueId)
    .select(ISSUE_COLUMNS)
    .single()

  if (updateError) {
    throw httpError(500, `Could not update issue: ${updateError.message}`)
  }

  const { error: eventError } = await backend.from('verification_events').insert({
    issue_id: issueId,
    actor_id: actorProfileId,
    action: decision,
    notes,
  })

  if (eventError) {
    throw httpError(500, `Could not record verification event: ${eventError.message}`)
  }

  return updated
}

/**
 * Merge `issue` into targetIssueId: move all observation links over, mark
 * the source issue 'merged', and record the verification event. The target's
 * severity/confidence are recomputed by the trg_sync_issue trigger as the
 * new links land.
 */
async function mergeIssue(issue, targetIssueId, actorProfileId, notes) {
  const backend = getClient()

  assertTransition(issue.status, 'merged')

  const { data: target, error: targetError } = await backend
    .from('issues')
    .select(ISSUE_COLUMNS)
    .eq('id', targetIssueId)
    .single()

  if (targetError || !target) {
    throw httpError(404, 'Merge target issue not found')
  }

  const { data: links, error: linksError } = await backend
    .from('issue_observations')
    .select('observation_id')
    .eq('issue_id', issue.id)

  if (linksError) {
    throw httpError(500, `Could not read observation links: ${linksError.message}`)
  }

  const observationIds = (links ?? []).map((row) => row.observation_id)

  if (observationIds.length > 0) {
    const { error: moveError } = await backend
      .from('issue_observations')
      .upsert(observationIds.map((observationId) => ({ issue_id: targetIssueId, observation_id: observationId })))

    if (moveError) {
      throw httpError(500, `Could not move observations to target issue: ${moveError.message}`)
    }

    const { error: deleteError } = await backend
      .from('issue_observations')
      .delete()
      .eq('issue_id', issue.id)

    if (deleteError) {
      throw httpError(500, `Could not detach observations from source issue: ${deleteError.message}`)
    }
  }

  const { data: updated, error: updateError } = await backend
    .from('issues')
    .update({ status: 'merged' })
    .eq('id', issue.id)
    .select(ISSUE_COLUMNS)
    .single()

  if (updateError) {
    throw httpError(500, `Could not update source issue: ${updateError.message}`)
  }

  const { error: eventError } = await backend.from('verification_events').insert({
    issue_id: issue.id,
    actor_id: actorProfileId,
    action: 'merged',
    notes: notes ?? `merged into ${targetIssueId}`,
  })

  if (eventError) {
    throw httpError(500, `Could not record merge event: ${eventError.message}`)
  }

  return { source: updated, target }
}

/**
 * Assign a department. Auto-advances status: 'potential'/'verified' become
 * 'assigned'; other statuses keep their state. Records an audit note via
 * verification_events only for legal actions — assignment itself is tracked
 * in issue_history by the status-change trigger when a transition happens.
 */
export async function assignIssue(issueId, departmentId, actorProfileId) {
  const backend = getClient()

  const { data: issue, error } = await backend.from('issues').select(ISSUE_COLUMNS).eq('id', issueId).single()
  if (error || !issue) {
    throw httpError(404, 'Issue not found')
  }

  const { data: department, error: deptError } = await backend
    .from('departments')
    .select('id, name, contact')
    .eq('id', departmentId)
    .single()

  if (deptError || !department) {
    throw httpError(400, 'Unknown departmentId')
  }

  const payload = { department_id: departmentId }
  if (issue.status === 'potential' || issue.status === 'verified') {
    payload.status = 'assigned'
  }

  const { data: updated, error: updateError } = await backend
    .from('issues')
    .update(payload)
    .eq('id', issueId)
    .select(ISSUE_COLUMNS)
    .single()

  if (updateError) {
    throw httpError(500, `Could not assign issue: ${updateError.message}`)
  }

  if (payload.status && payload.status !== issue.status) {
    const { error: eventError } = await backend.from('verification_events').insert({
      issue_id: issueId,
      actor_id: actorProfileId,
      action: 'verified', // schema restricts actions; assignment is implied by history
      notes: `assigned to ${department.name}`,
    })

    if (eventError) {
      throw httpError(500, `Could not record assignment event: ${eventError.message}`)
    }
  }

  return updated
}

/** Change status with transition validation. */
export async function updateIssueStatus(issueId, toStatus, actorProfileId) {
  const backend = getClient()

  const { data: issue, error } = await backend.from('issues').select(ISSUE_COLUMNS).eq('id', issueId).single()
  if (error || !issue) {
    throw httpError(404, 'Issue not found')
  }

  try {
    assertTransition(issue.status, toStatus)
  } catch (err) {
    if (err instanceof TransitionError) {
      throw httpError(409, err.message)
    }
    throw err
  }

  const { data: updated, error: updateError } = await backend
    .from('issues')
    .update({ status: toStatus })
    .eq('id', issueId)
    .select(ISSUE_COLUMNS)
    .single()

  if (updateError) {
    throw httpError(500, `Could not update status: ${updateError.message}`)
  }

  // issue_history is written by the trg_issues_status_change trigger; no
  // service-side insert to avoid duplicates.
  return updated
}
