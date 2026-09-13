import { SEVERITY_RANK } from '../../matching/scoring.js'

/**
 * Rule-based analysis (Stage 5 fallback).
 *
 * Used directly when no AI_API_KEY is configured and automatically when the
 * provider call fails. Keeps the platform fully functional (and fully
 * testable) without any external AI dependency.
 */

export function modeCategory(observations) {
  const counts = observations.reduce((acc, o) => {
    acc[o.category] = (acc[o.category] ?? 0) + 1
    return acc
  }, {})
  let best = 'OTHER'
  let bestCount = -1
  for (const [category, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = category
      bestCount = count
    }
  }
  return best
}

export function maxSeverity(observations) {
  let best = 'low'
  let bestRank = 0
  for (const o of observations) {
    const rank = SEVERITY_RANK[o.severity] ?? 0
    if (rank > bestRank) {
      best = o.severity
      bestRank = rank
    }
  }
  return best
}

const DEPARTMENT_BY_CATEGORY = {
  ROAD_DAMAGE: 'Roads & Transport',
  WATER_LEAK: 'Water & Sewerage',
  DRAINAGE: 'Water & Sewerage',
  STREETLIGHT: 'Street Lighting',
  TRAFFIC_SIGNAL: 'Roads & Transport',
  GARBAGE: 'Sanitation & Waste',
  FLOODING: 'Disaster Management',
  DAMAGED_SIGN: 'Roads & Transport',
  OTHER: null,
}

export function recommendedDepartmentFor(category) {
  return DEPARTMENT_BY_CATEGORY[category] ?? null
}

const CAUSE_BY_CATEGORY = {
  ROAD_DAMAGE: 'Progressive pavement deterioration, likely accelerated by water ingress and traffic load',
  WATER_LEAK: 'Aging or corroded pipe infrastructure, possibly with joint failure under pressure',
  STREETLIGHT: 'Bulb/ballast failure, tripped feeder, or localized power outage',
  GARBAGE: 'Missed collection cycle or repeated illegal dumping at an unsupervised spot',
  FLOODING: 'Heavy rainfall overwhelming the local drainage capacity',
  DRAINAGE: 'Blocked or clogged storm drain preventing runoff from clearing',
  TRAFFIC_SIGNAL: 'Power supply fault or signal controller hardware failure',
  DAMAGED_SIGN: 'Vehicle impact, weathering, or vandalism to the sign assembly',
  OTHER: 'Insufficient evidence to determine a cause',
}

export function potentialCauseFor(category, observations) {
  const cause = CAUSE_BY_CATEGORY[category] ?? CAUSE_BY_CATEGORY.OTHER

  // Weather observations in the cluster strengthen rain-related causes.
  const hasWeather = observations.some((o) => o.source === 'weather')
  if (hasWeather && (category === 'FLOODING' || category === 'DRAINAGE' || category === 'ROAD_DAMAGE')) {
    return `${cause}; corroborated by active weather signals near the site`
  }
  return cause
}

/**
 * Human-readable reasoning string citing the concrete evidence used.
 * `signals` is the shape produced by matching/scoring.js scoreIncident().
 */
export function buildReasoning(observations, signals) {
  const hoursOld =
    Math.max(0, (Date.now() - new Date(observations[0]?.timestamp ?? Date.now()).getTime())) / 3600000

  const parts = [
    `${signals.observation_count} observation(s) from ${signals.distinct_sources} distinct source(s)`,
    `modal category agreed across the cluster`,
    `severity agreement ${(signals.agreement ?? 0).toFixed(0)}%`,
    signals.max_member_confidence != null
      ? `strongest source confidence ${Number(signals.max_member_confidence).toFixed(0)}/100`
      : null,
    hoursOld <= 24 ? 'reported within the last 24h' : `newest report ~${Math.round(hoursOld)}h old`,
  ].filter(Boolean)

  return `Heuristic analysis: ${parts.join(', ')}.`
}
