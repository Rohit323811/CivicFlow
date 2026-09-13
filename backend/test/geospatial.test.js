import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateConfidenceScore,
  groupObservationsIntoIncidents,
} from '../src/services/geospatial.service.js'

test('calculateConfidenceScore increases with multiple sources and observations', () => {
  const singleObs = [{ source: 'citizen', timestamp: new Date().toISOString() }]
  const multiObs = [
    { source: 'citizen', timestamp: new Date().toISOString() },
    { source: 'weather', timestamp: new Date().toISOString() },
    { source: 'osm', timestamp: new Date().toISOString() },
  ]

  const singleScore = calculateConfidenceScore(singleObs)
  const multiScore = calculateConfidenceScore(multiObs)

  assert.ok(multiScore > singleScore)
  assert.ok(singleScore >= 0.50)
  assert.ok(multiScore <= 0.99)
})

test('groupObservationsIntoIncidents groups observations into unified incident', () => {
  const obsList = [
    {
      source: 'citizen',
      category: 'ROAD_DAMAGE',
      severity: 'medium',
      lat: 37.7749,
      lng: -122.4194,
      timestamp: new Date().toISOString(),
    },
    {
      source: 'weather',
      category: 'ROAD_DAMAGE',
      severity: 'high',
      lat: 37.7750,
      lng: -122.4195,
      timestamp: new Date().toISOString(),
    },
  ]

  const incidents = groupObservationsIntoIncidents(obsList, 50, 24)
  assert.equal(incidents.length, 1)
  assert.equal(incidents[0].category, 'ROAD_DAMAGE')
  assert.equal(incidents[0].severity, 'high')
  assert.equal(incidents[0].observations.length, 2)
  assert.equal(incidents[0].status, 'potential')
})
