/**
 * Category mapping dictionary mapping raw source labels to normalized standard categories.
 */
export const CATEGORY_MAP = {
  // Road & Street damage
  pothole: 'ROAD_DAMAGE',
  'road defect': 'ROAD_DAMAGE',
  'asphalt crack': 'ROAD_DAMAGE',
  sinkhole: 'ROAD_DAMAGE',
  'damaged pavement': 'ROAD_DAMAGE',

  // Water & Drainage
  'water leak': 'WATER_INFRASTRUCTURE',
  'burst pipe': 'WATER_INFRASTRUCTURE',
  flooding: 'WATER_INFRASTRUCTURE',
  'drain blockage': 'WATER_INFRASTRUCTURE',
  'sewer overflow': 'WATER_INFRASTRUCTURE',

  // Electrical & Street Lighting
  'street light': 'ELECTRICAL_LIGHTING',
  'broken streetlight': 'ELECTRICAL_LIGHTING',
  'dark lamp': 'ELECTRICAL_LIGHTING',
  'power outage': 'ELECTRICAL_LIGHTING',

  // Waste & Sanitation
  garbage: 'WASTE_MANAGEMENT',
  trash: 'WASTE_MANAGEMENT',
  litter: 'WASTE_MANAGEMENT',
  'illegal dumping': 'WASTE_MANAGEMENT',

  // Vegetation & Public Trees
  'fallen tree': 'VEGETATION',
  'broken branch': 'VEGETATION',
  'overgrown grass': 'VEGETATION',
}

export function normalizeCategory(rawCategory = '') {
  if (!rawCategory) return 'OTHER'
  const key = String(rawCategory).trim().toLowerCase()
  return CATEGORY_MAP[key] || 'OTHER'
}

export function normalizeSeverity(rawSeverity = '') {
  const s = String(rawSeverity).trim().toLowerCase()
  if (['low', 'medium', 'high', 'critical'].includes(s)) return s
  if (s === 'minor') return 'low'
  if (s === 'moderate') return 'medium'
  if (s === 'severe' || s === 'urgent') return 'high'
  if (s === 'emergency' || s === 'extreme') return 'critical'
  return 'medium'
}

/**
 * Maps raw source payload into common Observation schema.
 */
export function normalizeObservation(rawRecord, sourceType = 'other') {
  const lat = parseFloat(rawRecord.lat ?? rawRecord.latitude)
  const lng = parseFloat(rawRecord.lng ?? rawRecord.longitude ?? rawRecord.lon)

  if (isNaN(lat) || isNaN(lng)) {
    throw new Error('Observation missing valid latitude or longitude.')
  }

  return {
    source: sourceType,
    source_record_id: String(rawRecord.id || rawRecord.source_record_id || rawRecord.osm_id || ''),
    category: normalizeCategory(rawRecord.category || rawRecord.type || rawRecord.title),
    description: rawRecord.description || rawRecord.details || rawRecord.summary || '',
    lat,
    lng,
    timestamp: new Date(rawRecord.timestamp || rawRecord.created_at || Date.now()).toISOString(),
    severity: normalizeSeverity(rawRecord.severity),
    confidence: typeof rawRecord.confidence === 'number' ? rawRecord.confidence : 1.00,
    evidence: rawRecord.evidence || rawRecord.raw_data || {},
  }
}

/**
 * Calculates Haversine distance between two lat/lng points in meters.
 */
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Clusters observations into duplicate groups within a spatial radius (meters) and time window (hours).
 */
export function clusterObservations(observations = [], radiusMeters = 50, maxTimeDiffHours = 24) {
  const clusters = []
  const maxTimeMs = maxTimeDiffHours * 60 * 60 * 1000

  for (const obs of observations) {
    let addedToCluster = false

    for (const cluster of clusters) {
      // Check if obs matches cluster criteria against any member in the cluster
      const belongsToCluster = cluster.some((item) => {
        const distance = haversineDistanceMeters(obs.lat, obs.lng, item.lat, item.lng)
        const timeDiff = Math.abs(new Date(obs.timestamp).getTime() - new Date(item.timestamp).getTime())
        const sameCategory = obs.category === item.category

        return sameCategory && distance <= radiusMeters && timeDiff <= maxTimeMs
      })

      if (belongsToCluster) {
        cluster.push(obs)
        addedToCluster = true
        break
      }
    }

    if (!addedToCluster) {
      clusters.push([obs])
    }
  }

  return clusters
}
