import { env } from '../config/env.js'

/**
 * Recommended department mapping by category
 */
const DEPARTMENT_RECOMMENDATIONS = {
  ROAD_DAMAGE: 'Department of Transportation & Public Works',
  WATER_INFRASTRUCTURE: 'Water and Sewerage Authority',
  ELECTRICAL_LIGHTING: 'Bureau of Street Lighting',
  WASTE_MANAGEMENT: 'Department of Sanitation',
  VEGETATION: 'Parks & Recreation Department',
  OTHER: 'General Municipal Services',
}

/**
 * Analyze a cluster of observations and produce AI analysis recommendations.
 * Important Rule: AI never auto-verifies. All AI output sets status to 'potential'.
 */
export async function analyzeObservationCluster(cluster = []) {
  if (!cluster || cluster.length === 0) {
    throw new Error('Cannot analyze empty observation cluster.')
  }

  const categoryCounts = {}
  const sources = new Set()
  let highestSeverity = 'low'
  const severities = ['low', 'medium', 'high', 'critical']

  for (const obs of cluster) {
    sources.add(obs.source)
    categoryCounts[obs.category] = (categoryCounts[obs.category] || 0) + 1
    if (severities.indexOf(obs.severity) > severities.indexOf(highestSeverity)) {
      highestSeverity = obs.severity
    }
  }

  // Determine primary category
  let primaryCategory = 'OTHER'
  let maxCount = 0
  for (const [cat, count] of Object.entries(categoryCounts)) {
    if (count > maxCount) {
      maxCount = count
      primaryCategory = cat
    }
  }

  // Potential causes based on category
  const potentialCauses = {
    ROAD_DAMAGE: 'Heavy traffic wear, freeze-thaw cycles, or base material erosion.',
    WATER_INFRASTRUCTURE: 'Aging pipe infrastructure, high water pressure, or soil shift.',
    ELECTRICAL_LIGHTING: 'Failing fixture, transformer issue, or wiring damage.',
    WASTE_MANAGEMENT: 'Illegal dumping or missed collection schedule.',
    VEGETATION: 'Storm damage, root rot, or severe weather conditions.',
    OTHER: 'Unspecified environmental or urban factor.',
  }

  const reasoning = `Analyzed ${cluster.length} observations from ${sources.size} source(s) [${Array.from(sources).join(', ')}]. High correlation detected for category ${primaryCategory}.`

  // Confidence calculation
  const confidence = Math.min(0.95, 0.50 + sources.size * 0.15 + (cluster.length - 1) * 0.05)

  return {
    category: primaryCategory,
    potential_cause: potentialCauses[primaryCategory] || potentialCauses.OTHER,
    severity: highestSeverity,
    confidence: Math.round(confidence * 100) / 100,
    recommended_department: DEPARTMENT_RECOMMENDATIONS[primaryCategory] || DEPARTMENT_RECOMMENDATIONS.OTHER,
    reasoning,
    status: 'potential', // ALWAYS 'potential' - AI NEVER auto-verifies
  }
}
