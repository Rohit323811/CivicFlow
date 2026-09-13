import { requireSupabase } from '../config/supabase.js'

/**
 * Creates a report (observation + associated potential issue).
 */
export async function createReportData({ category, description, lat, lng, severity, evidence, userId }) {
  const supabase = requireSupabase()

  // 1. Create Observation record
  const { data: observation, error: obsError } = await supabase
    .from('observations')
    .insert({
      source: 'citizen',
      source_record_id: userId || null,
      category,
      description,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      severity: severity || 'medium',
      confidence: 1.00,
      evidence: evidence || {},
      timestamp: new Date().toISOString(),
    })
    .select()
    .single()

  if (obsError) throw new Error(`Failed to create observation: ${obsError.message}`)

  // 2. Create Potential Issue record
  const { data: issue, error: issueError } = await supabase
    .from('issues')
    .insert({
      category,
      description,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      severity: severity || 'medium',
      confidence: 0.50, // initial citizen submission confidence
      status: 'potential',
    })
    .select()
    .single()

  if (issueError) throw new Error(`Failed to create issue: ${issueError.message}`)

  // 3. Link Observation and Issue in many-to-many junction table
  const { error: linkError } = await supabase
    .from('issue_observations')
    .insert({
      issue_id: issue.id,
      observation_id: observation.id,
    })

  if (linkError) throw new Error(`Failed to link observation to issue: ${linkError.message}`)

  return {
    issue,
    observation,
  }
}
