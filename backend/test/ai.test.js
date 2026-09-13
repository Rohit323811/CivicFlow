import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeObservationCluster } from '../src/services/ai.service.js'

test('analyzeObservationCluster returns structured AI recommendations', async () => {
  const cluster = [
    { source: 'citizen', category: 'ROAD_DAMAGE', severity: 'medium' },
    { source: 'weather', category: 'ROAD_DAMAGE', severity: 'high' },
  ]

  const result = await analyzeObservationCluster(cluster)

  assert.equal(result.category, 'ROAD_DAMAGE')
  assert.equal(result.severity, 'high')
  assert.equal(result.recommended_department, 'Department of Transportation & Public Works')
  assert.ok(result.reasoning.includes('Analyzed 2 observations'))
  assert.ok(result.confidence >= 0.70)
})

test('analyzeObservationCluster ALWAYS sets status to potential (NEVER auto-verifies)', async () => {
  const cluster = [
    { source: 'citizen', category: 'WATER_INFRASTRUCTURE', severity: 'critical' },
    { source: 'osm', category: 'WATER_INFRASTRUCTURE', severity: 'critical' },
    { source: 'weather', category: 'WATER_INFRASTRUCTURE', severity: 'critical' },
  ]

  const result = await analyzeObservationCluster(cluster)

  assert.equal(result.status, 'potential')
  assert.notEqual(result.status, 'verified')
})
