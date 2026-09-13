import { requireSupabase } from '../config/supabase.js'

/**
 * Fetch summary analytics (total issues, count by category, status, severity)
 */
export async function getSummaryAnalytics() {
  const supabase = requireSupabase()

  const { data: issues, error: issuesError } = await supabase
    .from('issues')
    .select('category, severity, status')

  if (issuesError) throw new Error(`Failed to fetch analytics issues: ${issuesError.message}`)

  const { count: totalObservations, error: obsError } = await supabase
    .from('observations')
    .select('*', { count: 'exact', head: true })

  if (obsError) throw new Error(`Failed to fetch analytics observations count: ${obsError.message}`)

  const byCategory = {}
  const bySeverity = {}
  const byStatus = {}

  for (const issue of issues || []) {
    byCategory[issue.category] = (byCategory[issue.category] || 0) + 1
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1
    byStatus[issue.status] = (byStatus[issue.status] || 0) + 1
  }

  return {
    total_issues: issues ? issues.length : 0,
    total_observations: totalObservations || 0,
    by_category: byCategory,
    by_severity: bySeverity,
    by_status: byStatus,
  }
}
