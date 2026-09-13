import { haversineMeters, centroidOf } from '../utils/geo.js'

export const DEFAULTS = {
  radiusMeters: 50,
  timeWindowMs: 48 * 60 * 60 * 1000, // 48h
}

/**
 * Deduplication (Stage 3): cluster observations that describe the same
 * real-world problem.
 *
 * Leader clustering over chronologically sorted observations:
 *  - an observation joins a cluster when it matches category, is within
 *    `radiusMeters` of the cluster centroid, and within `timeWindowMs` of the
 *    cluster's most recent observation
 *  - otherwise it starts a new cluster
 *
 * Deterministic and dependency-free; Stage 4 consumes the clusters.
 *
 * @param {Array} observations canonical observations (see observationSchema)
 * @param {{ radiusMeters?: number, timeWindowMs?: number }} options
 * @returns {Array<{key: string, category: string, centroid: [lat, lng],
 *   firstTimestamp: string, lastTimestamp: string, members: Array}>}
 */
export function clusterObservations(observations, options = {}) {
  const radiusMeters = options.radiusMeters ?? DEFAULTS.radiusMeters
  const timeWindowMs = options.timeWindowMs ?? DEFAULTS.timeWindowMs

  const sorted = [...observations].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const clusters = []

  for (const observation of sorted) {
    const point = [observation.lat, observation.lng]
    const ts = new Date(observation.timestamp).getTime()

    const match = clusters.find((cluster) => {
      if (cluster.category !== observation.category) return false
      const lastTs = new Date(cluster.lastTimestamp).getTime()
      if (ts - lastTs > timeWindowMs) return false
      return haversineMeters(cluster.centroid, point) <= radiusMeters
    })

    if (match) {
      match.members.push(observation)
      match.lastTimestamp = observation.timestamp
      match.centroid = centroidOf(match.members.map((o) => [o.lat, o.lng]))
    } else {
      clusters.push({
        key: `${observation.category}:${observation.lat.toFixed(5)},${observation.lng.toFixed(5)}:${observation.timestamp}`,
        category: observation.category,
        centroid: point,
        firstTimestamp: observation.timestamp,
        lastTimestamp: observation.timestamp,
        members: [observation],
      })
    }
  }

  return clusters
}

/** Split a batch into unique representatives + duplicates they absorb. */
export function deduplicateObservations(observations, options) {
  const clusters = clusterObservations(observations, options)
  const unique = []
  const duplicates = []

  clusters.forEach((cluster) => {
    const [representative, ...rest] = cluster.members
    unique.push(representative)
    rest.forEach((duplicate) => {
      duplicates.push({ duplicate, kept: representative, clusterKey: cluster.key })
    })
  })

  return { unique, duplicates, clusters }
}
