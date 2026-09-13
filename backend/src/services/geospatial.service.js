import { haversineDistanceMeters, clusterObservations } from './normalization.service.js'

/**
 * Calculates dynamic confidence score for a cluster of observations.
 * Confidence increases with:
 * - Number of distinct sources (e.g. citizen + weather + OSM)
 * - Number of observations in cluster
 * - Recency of observations
 */
export function calculateConfidenceScore(cluster = []) {
  if (!cluster || cluster.length === 0) return 0.0

  const sourceSet = new Set(cluster.map((obs) => obs.source))
  const sourceCount = sourceSet.size
  const obsCount = cluster.length

  // Recency score (decays over time, max 1.0 for observations within last 24h)
  const now = Date.now()
  const newestTimestamp = Math.max(...cluster.map((obs) => new Date(obs.timestamp || Date.now()).getTime()))
  const ageInHours = Math.max(0, (now - newestTimestamp) / (1000 * 60 * 60))
  const recencyMultiplier = Math.max(0.5, 1.0 - ageInHours / (24 * 7)) // decays up to 7 days

  // Base confidence formula
  // 1 obs from 1 source = 0.50
  // Multi-source / multi-report increases confidence up to 0.99 max
  let score = 0.40 + sourceCount * 0.20 + Math.min(obsCount - 1, 5) * 0.05
  score = score * recencyMultiplier

  return Math.min(0.99, Math.max(0.10, Math.round(score * 100) / 100))
}

/**
 * Groups raw observations into unified candidate incidents.
 */
export function groupObservationsIntoIncidents(observations = [], radiusMeters = 50, maxTimeDiffHours = 48) {
  const clusters = clusterObservations(observations, radiusMeters, maxTimeDiffHours)

  return clusters.map((cluster) => {
    // Calculate centroid location
    const avgLat = cluster.reduce((sum, o) => sum + o.lat, 0) / cluster.length
    const avgLng = cluster.reduce((sum, o) => sum + o.lng, 0) / cluster.length

    // Dominant category & highest severity
    const category = cluster[0].category
    const severities = ['low', 'medium', 'high', 'critical']
    let highestSeverity = 'low'
    for (const obs of cluster) {
      if (severities.indexOf(obs.severity) > severities.indexOf(highestSeverity)) {
        highestSeverity = obs.severity
      }
    }

    const confidence = calculateConfidenceScore(cluster)

    return {
      category,
      lat: Math.round(avgLat * 1e6) / 1e6,
      lng: Math.round(avgLng * 1e6) / 1e6,
      severity: highestSeverity,
      confidence,
      observations: cluster,
      status: 'potential',
    }
  })
}
