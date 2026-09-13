import { getBackendClient } from '../config/supabase.js'
import { httpError } from '../utils/httpError.js'

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] ?? 0) + 1
    return acc
  }, {})
}

/**
 * GET /api/analytics/summary payload — authority/admin only.
 * Small aggregate queries through the service client; kept intentionally
 * simple (no materialized views) until real volume demands it.
 */
export async function getAnalyticsSummary() {
  const backend = getBackendClient()
  if (!backend) {
    throw httpError(503, 'Supabase service client not configured (SUPABASE_SERVICE_ROLE_KEY)')
  }

  const [issuesRes, observationsRes, runsRes, departmentsRes] = await Promise.all([
    backend
      .from('issues')
      .select('id, category, severity, status, department_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5000),
    backend.from('observations').select('id, source, created_at').limit(10000),
    backend
      .from('source_runs')
      .select('id, source_id, status, started_at, finished_at, records_fetched')
      .order('started_at', { ascending: false })
      .limit(5),
    backend.from('departments').select('id, name'),
  ])

  if (issuesRes.error) throw httpError(500, `Could not load issues: ${issuesRes.error.message}`)
  if (observationsRes.error) throw httpError(500, `Could not load observations: ${observationsRes.error.message}`)
  if (runsRes.error) throw httpError(500, `Could not load source runs: ${runsRes.error.message}`)
  if (departmentsRes.error) throw httpError(500, `Could not load departments: ${departmentsRes.error.message}`)

  const issues = issuesRes.data ?? []
  const observations = observationsRes.data ?? []
  const departments = departmentsRes.data ?? []
  const departmentNames = Object.fromEntries(departments.map((d) => [d.id, d.name]))

  const activeStatuses = ['verified', 'assigned', 'in_progress']
  const issuesByDepartment = issues.reduce((acc, issue) => {
    if (!issue.department_id) return acc
    const name = departmentNames[issue.department_id] ?? 'unknown'
    acc[name] = (acc[name] ?? 0) + 1
    return acc
  }, {})

  const last24h = Date.now() - 24 * 60 * 60 * 1000

  return {
    totals: {
      issues: issues.length,
      active_issues: issues.filter((i) => activeStatuses.includes(i.status)).length,
      potential_issues: issues.filter((i) => i.status === 'potential').length,
      resolved_issues: issues.filter((i) => i.status === 'resolved').length,
      observations: observations.length,
      issues_last_24h: issues.filter((i) => new Date(i.created_at).getTime() >= last24h).length,
    },
    by_category: countBy(issues, 'category'),
    by_severity: countBy(issues, 'severity'),
    by_status: countBy(issues, 'status'),
    observations_by_source: countBy(observations, 'source'),
    issues_by_department: issuesByDepartment,
    recent_source_runs: runsRes.data ?? [],
  }
}
