import { clusterObservations } from '../ingestion/dedup.js'

export const INCIDENT_DEFAULTS = {
  // Wider than the Stage 3 dedup radius: different sources geocode the same
  // problem with different precision, so incidents tolerate more spread.
  radiusMeters: 100,
  timeWindowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
}

/**
 * Group observations into incidents (Stage 4).
 *
 * Same leader-clustering rule as dedup (category + distance + time window)
 * but with incident-scale defaults. Every returned cluster is a candidate
 * incident; scoring (scoring.js) and the DB layer decide whether it becomes
 * a new 'potential' issue or joins an existing one.
 */
export function groupIntoIncidents(observations, options = {}) {
  return clusterObservations(observations, {
    radiusMeters: options.radiusMeters ?? INCIDENT_DEFAULTS.radiusMeters,
    timeWindowMs: options.timeWindowMs ?? INCIDENT_DEFAULTS.timeWindowMs,
  })
}
