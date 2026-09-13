import { requireSupabase } from '../config/supabase.js'

/**
 * Fetch issues list with optional filters (category, severity, status, bounds)
 */
export async function getIssues(filters = {}) {
  const supabase = requireSupabase()
  let query = supabase.from('issues').select('*, departments(id, name)')

  if (filters.category) {
    query = query.eq('category', filters.category)
  }

  if (filters.severity) {
    query = query.eq('severity', filters.severity)
  }

  if (filters.status) {
    query = query.eq('status', filters.status)
  }

  if (filters.bounds) {
    // bounds format: minLat,minLng,maxLat,maxLng
    const parts = filters.bounds.split(',').map(Number)
    if (parts.length === 4 && !parts.some(isNaN)) {
      const [minLat, minLng, maxLat, maxLng] = parts
      query = query
        .gte('lat', minLat)
        .lte('lat', maxLat)
        .gte('lng', minLng)
        .lte('lng', maxLng)
    }
  }

  query = query.order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) throw new Error(`Failed to fetch issues: ${error.message}`)
  return data
}

/**
 * Fetch issue details by ID including observations and history
 */
export async function getIssueById(id) {
  const supabase = requireSupabase()

  const { data: issue, error: issueError } = await supabase
    .from('issues')
    .select('*, departments(id, name, contact)')
    .eq('id', id)
    .single()

  if (issueError || !issue) {
    return null
  }

  // Fetch observations via issue_observations junction table
  const { data: observationsData, error: obsError } = await supabase
    .from('issue_observations')
    .select('observations(*)')
    .eq('issue_id', id)

  if (obsError) throw new Error(`Failed to fetch issue observations: ${obsError.message}`)

  const observations = observationsData ? observationsData.map((item) => item.observations) : []

  // Fetch history
  const { data: history, error: historyError } = await supabase
    .from('issue_history')
    .select('*, profiles(id, name, email, role)')
    .eq('issue_id', id)
    .order('created_at', { ascending: false })

  if (historyError) throw new Error(`Failed to fetch issue history: ${historyError.message}`)

  // Fetch verification events
  const { data: verificationEvents, error: verificationError } = await supabase
    .from('verification_events')
    .select('*, profiles(id, name, email, role)')
    .eq('issue_id', id)
    .order('created_at', { ascending: false })

  if (verificationError) throw new Error(`Failed to fetch verification events: ${verificationError.message}`)

  return {
    ...issue,
    observations,
    history,
    verification_events: verificationEvents,
  }
}

/**
 * Verify, reject, or merge an issue
 */
export async function verifyIssue(id, { action, notes, actorId }) {
  const supabase = requireSupabase()

  // Validate action
  const validActions = ['verified', 'rejected', 'merged']
  if (!validActions.includes(action)) {
    throw new Error(`Invalid action. Must be one of: ${validActions.join(', ')}`)
  }

  // Update issue status based on action
  let newStatus = 'verified'
  if (action === 'rejected') newStatus = 'rejected'
  if (action === 'merged') newStatus = 'resolved'

  const { data: updatedIssue, error: updateError } = await supabase
    .from('issues')
    .update({
      status: newStatus,
      confidence: action === 'verified' ? 1.00 : undefined,
    })
    .eq('id', id)
    .select()
    .single()

  if (updateError) throw new Error(`Failed to update issue verification status: ${updateError.message}`)

  // Log verification event
  const { data: verificationEvent, error: eventError } = await supabase
    .from('verification_events')
    .insert({
      issue_id: id,
      actor_id: actorId,
      action,
      notes: notes || null,
    })
    .select()
    .single()

  if (eventError) throw new Error(`Failed to record verification event: ${eventError.message}`)

  // Record history
  await supabase.from('issue_history').insert({
    issue_id: id,
    status_change: newStatus,
    actor_id: actorId,
  })

  return {
    issue: updatedIssue,
    verification_event: verificationEvent,
  }
}

/**
 * Assign department to an issue
 */
export async function assignDepartment(id, { departmentId, actorId }) {
  const supabase = requireSupabase()

  const { data: updatedIssue, error: updateError } = await supabase
    .from('issues')
    .update({ department_id: departmentId })
    .eq('id', id)
    .select('*, departments(id, name)')
    .single()

  if (updateError) throw new Error(`Failed to assign department to issue: ${updateError.message}`)

  return updatedIssue
}

/**
 * Update status of an issue
 */
export async function updateStatus(id, { status, actorId }) {
  const supabase = requireSupabase()

  const validStatuses = ['potential', 'verified', 'in_progress', 'resolved', 'rejected']
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`)
  }

  const { data: updatedIssue, error: updateError } = await supabase
    .from('issues')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (updateError) throw new Error(`Failed to update issue status: ${updateError.message}`)

  // Record in history
  await supabase.from('issue_history').insert({
    issue_id: id,
    status_change: status,
    actor_id: actorId,
  })

  return updatedIssue
}
