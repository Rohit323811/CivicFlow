import { getBackendClient } from '../config/supabase.js'
import { httpError } from '../utils/httpError.js'
import { haversineMeters } from '../utils/geo.js'
import { groupIntoIncidents } from '../matching/grouping.js'
import { scoreIncident } from '../matching/scoring.js'

const OPEN_ISSUE_STATUSES = ['potential', 'verified', 'assigned', 'in_progress']

const OBSERVATION_COLUMNS = 'id, source, source_record_id, category, lat, lng, "timestamp", severity, confidence'

/**
 * Stage 4 orchestration (invoked by Stage 6 collectors after a batch lands):
 *
 *  1. load observations that are not yet linked to any issue
 *  2. group them into incidents (category + 100m + 7d)
 *  3. for each incident, look for an OPEN issue of the same category within
 *     the match radius -> link the members (the trg_sync_issue trigger
 *     recomputes the issue's severity/confidence)
 *  4. otherwise create a NEW 'potential' issue at the incident centroid with
 *     the scored severity/confidence, then link the members
 *
 * Never touches 'resolved'/'rejected'/'merged' issues; never verifies.
 */
export async function matchUnlinkedObservations(options = {}) {
  const backend = getBackendClient()
  if (!backend) {
    throw httpError(503, 'Supabase service client not configured (SUPABASE_SERVICE_ROLE_KEY)')
  }

  const matchRadius = options.matchRadiusMeters ?? 100
  const summary = {
    observations_considered: 0,
    incidents: 0,
    issues_matched: 0,
    issues_created: 0,
    links_created: 0,
  }

  // ---- 1. unlinked observations ------------------------------------------
  const { data: linkedIds, error: linkedError } = await backend
    .from('issue_observations')
    .select('observation_id')
  if (linkedError) {
    throw httpError(500, `Could not load issue links: ${linkedError.message}`)
  }
  const linkedSet = new Set((linkedIds ?? []).map((row) => row.observation_id))

  const { data: allObservations, error: obsError } = await backend
    .from('observations')
    .select(OBSERVATION_COLUMNS)
    .order('timestamp', { ascending: true })
    .limit(options.batchLimit ?? 5000)
  if (obsError) {
    throw httpError(500, `Could not load observations: ${obsError.message}`)
  }

  const unlinked = (allObservations ?? [])
    .filter((o) => !linkedSet.has(o.id))
    .map((o) => ({ ...o, timestamp: o.timestamp }))
  summary.observations_considered = unlinked.length

  if (unlinked.length === 0) {
    return summary
  }

  // ---- 2. incidents -------------------------------------------------------
  const incidents = groupIntoIncidents(unlinked, options.incidentOptions)
  summary.incidents = incidents.length

  // Open issues cache: loaded lazily per category to keep queries bounded.
  const openIssuesByCategory = new Map()

  for (const incident of incidents) {
    const scored = scoreIncident(incident)
    let issueId = await findNearbyOpenIssue(backend, openIssuesByCategory, incident, matchRadius)

    if (issueId) {
      summary.issues_matched += 1
    } else {
      issueId = await createPotentialIssue(backend, incident, scored)
      summary.issues_created += 1
    }

    const { error: linkError } = await backend
      .from('issue_observations')
      .upsert(incident.members.map((member) => ({ issue_id: issueId, observation_id: member.id })))

    if (linkError) {
      throw httpError(500, `Could not link observations to issue ${issueId}: ${linkError.message}`)
    }
    summary.links_created += incident.members.length
  }

  return summary
}

async function findNearbyOpenIssue(backend, cache, incident, radiusMeters) {
  if (!cache.has(incident.category)) {
    const { data, error } = await backend
      .from('issues')
      .select('id, category, lat, lng, status')
      .eq('category', incident.category)
      .in('status', OPEN_ISSUE_STATUSES)
      .limit(1000)
    if (error) {
      throw httpError(500, `Could not load candidate issues: ${error.message}`)
    }
    cache.set(incident.category, data ?? [])
  }

  const candidates = cache.get(incident.category)
  const match = candidates.find(
    (issue) => haversineMeters([issue.lat, issue.lng], incident.centroid) <= radiusMeters
  )
  return match?.id ?? null
}

async function createPotentialIssue(backend, incident, scored) {
  const { data: issue, error } = await backend
    .from('issues')
    .insert({
      category: incident.category,
      description: incident.members[0]?.description ?? null,
      lat: incident.centroid[0],
      lng: incident.centroid[1],
      severity: scored.severity,
      confidence: scored.confidence,
      status: 'potential',
    })
    .select('id')
    .single()

  if (error || !issue) {
    throw httpError(500, `Could not create potential issue: ${error?.message ?? 'no row returned'}`)
  }

  const { error: historyError } = await backend.from('issue_history').insert({
    issue_id: issue.id,
    status_change: `created by geo matching (${scored.signals.observation_count} observation(s), ${scored.signals.distinct_sources} source(s), confidence ${scored.confidence})`,
  })

  if (historyError) {
    throw httpError(500, `Could not write issue history: ${historyError.message}`)
  }

  return issue.id
}
