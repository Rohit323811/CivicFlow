import { getBackendClient } from '../config/supabase.js'
import { httpError } from '../utils/httpError.js'
import { analyzeIncident } from './ai/analysisService.js'

/**
 * Stage 5 orchestration — analyze an issue's observation cluster and store
 * the structured output on the incident (issues.ai_analysis).
 *
 * INVARIANT: the update payload never contains `status` (or any other
 * lifecycle field). AI only ever annotates; verification stays a human
 * authority action. A test asserts this explicitly.
 */
export async function analyzeIssue(issueId) {
  const backend = getBackendClient()
  if (!backend) {
    throw httpError(503, 'Supabase service client not configured (SUPABASE_SERVICE_ROLE_KEY)')
  }

  const { data: issue, error: issueError } = await backend
    .from('issues')
    .select('id, category, description, lat, lng, severity, confidence, status')
    .eq('id', issueId)
    .single()

  if (issueError || !issue) {
    throw httpError(404, 'Issue not found')
  }

  const { data: links, error: linksError } = await backend
    .from('issue_observations')
    .select('observations(id, source, category, description, lat, lng, "timestamp", severity, confidence)')
    .eq('issue_id', issueId)

  if (linksError) {
    throw httpError(500, `Could not load observations for issue: ${linksError.message}`)
  }

  const observations = (links ?? []).map((row) => row.observations).filter(Boolean)

  const analysis = await analyzeIncident(observations)

  const { error: updateError } = await backend
    .from('issues')
    .update({
      ai_analysis: analysis,
      ai_analyzed_at: new Date().toISOString(),
    })
    .eq('id', issueId)

  if (updateError) {
    throw httpError(500, `Could not store AI analysis: ${updateError.message}`)
  }

  const { error: historyError } = await backend.from('issue_history').insert({
    issue_id: issueId,
    status_change: `ai analysis recorded via ${analysis.source} (status unchanged: ${issue.status})`,
  })

  if (historyError) {
    throw httpError(500, `Could not write AI history entry: ${historyError.message}`)
  }

  return { issueId, status: issue.status, analysis }
}

/**
 * Batch helper: analyze every 'potential' issue that has no analysis yet.
 * Returns per-issue outcomes; failures are collected, not fatal.
 */
export async function analyzePendingIssues(limit = 50) {
  const backend = getBackendClient()
  if (!backend) {
    throw httpError(503, 'Supabase service client not configured (SUPABASE_SERVICE_ROLE_KEY)')
  }

  const { data: issues, error } = await backend
    .from('issues')
    .select('id')
    .eq('status', 'potential')
    .is('ai_analyzed_at', null)
    .limit(limit)

  if (error) {
    throw httpError(500, `Could not load pending issues: ${error.message}`)
  }

  const results = []
  for (const row of issues ?? []) {
    try {
      results.push(await analyzeIssue(row.id))
    } catch (err) {
      results.push({ issueId: row.id, error: err.message })
    }
  }
  return results
}
