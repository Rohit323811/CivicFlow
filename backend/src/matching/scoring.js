/**
 * Stage 4 scoring — confidence for an incident (cluster of observations)
 * built from three signals:
 *
 *   1. corroboration: how many DISTINCT sources reported it
 *   2. agreement: how consistently members agree on the modal severity
 *   3. recency: how fresh the newest member is
 *
 * blended with the strongest member's own confidence. The result is capped
 * at 95 — nothing is ever "certain"; verification is a human action (Stage 5
 * rule: AI/matching never auto-verifies).
 */

export const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 }

export function maxSeverityOf(severities) {
  let best = null
  let bestRank = 0
  for (const severity of severities) {
    const rank = SEVERITY_RANK[severity] ?? 0
    if (rank > bestRank) {
      best = severity
      bestRank = rank
    }
  }
  return best
}

/** Distinct-source component: 1 source -> 50 ... 4+ sources -> 95. */
export function sourceComponent(distinctSources) {
  if (distinctSources <= 1) return 50
  if (distinctSources === 2) return 75
  if (distinctSources === 3) return 90
  return 95
}

/** Modal-severity agreement: fraction of members sharing the top severity. */
export function agreementComponent(severities) {
  if (severities.length === 0) return 0
  const counts = severities.reduce((acc, s) => {
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})
  const modal = Math.max(...Object.values(counts))
  return (modal / severities.length) * 100
}

/** Freshness of the newest member: 100 (<24h) decaying to 10 (30d+). */
export function recencyComponent(newestTimestamp, now = Date.now()) {
  const ageMs = now - new Date(newestTimestamp).getTime()
  const hours = ageMs / 3600000
  if (hours <= 24) return 100
  if (hours <= 24 * 7) return 70
  if (hours <= 24 * 30) return 40
  return 10
}

/**
 * Score a cluster (as produced by clusterObservations/groupIntoIncidents).
 * Returns { confidence, severity, signals } — confidence 0..95.
 */
export function scoreIncident(cluster, { now = Date.now() } = {}) {
  const members = cluster.members ?? []
  if (members.length === 0) {
    return { confidence: 0, severity: 'low', signals: { corroboration: 0, agreement: 0, recency: 0 } }
  }

  const severities = members.map((m) => m.severity)
  const distinctSources = new Set(members.map((m) => m.source)).size
  const maxMemberConfidence = Math.max(...members.map((m) => Number(m.confidence) || 0))
  const newestTimestamp = members.reduce(
    (latest, m) => (new Date(m.timestamp).getTime() > new Date(latest).getTime() ? m.timestamp : latest),
    members[0].timestamp
  )

  const corroboration = sourceComponent(distinctSources)
  const agreement = agreementComponent(severities)
  const recency = recencyComponent(newestTimestamp, now)

  const confidence = Math.min(
    95,
    Math.round((0.5 * maxMemberConfidence + 0.3 * corroboration + 0.1 * agreement + 0.1 * recency) * 100) / 100
  )

  return {
    confidence,
    severity: maxSeverityOf(severities) ?? 'low',
    signals: {
      distinct_sources: distinctSources,
      observation_count: members.length,
      max_member_confidence: maxMemberConfidence,
      corroboration,
      agreement: Math.round(agreement * 100) / 100,
      recency,
    },
  }
}
