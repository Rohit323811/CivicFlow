import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeCategory,
  normalizeSeverity,
  normalizeObservation,
  haversineDistanceMeters,
  clusterObservations,
} from '../src/services/normalization.service.js'

test('normalizeCategory maps raw labels correctly', () => {
  assert.equal(normalizeCategory('pothole'), 'ROAD_DAMAGE')
  assert.equal(normalizeCategory('Road Defect'), 'ROAD_DAMAGE')
  assert.equal(normalizeCategory('water leak'), 'WATER_INFRASTRUCTURE')
  assert.equal(normalizeCategory('street light'), 'ELECTRICAL_LIGHTING')
  assert.equal(normalizeCategory('garbage'), 'WASTE_MANAGEMENT')
  assert.equal(normalizeCategory('unknown defect'), 'OTHER')
})

test('normalizeSeverity maps severity terms correctly', () => {
  assert.equal(normalizeSeverity('minor'), 'low')
  assert.equal(normalizeSeverity('moderate'), 'medium')
  assert.equal(normalizeSeverity('severe'), 'high')
  assert.equal(normalizeSeverity('emergency'), 'critical')
  assert.equal(normalizeSeverity('invalid'), 'medium')
})

test('normalizeObservation formats raw records correctly', () => {
  const raw = {
    id: 'obs-123',
    category: 'Pothole',
    description: 'Deep pothole on main st',
    latitude: 37.7749,
    longitude: -122.4194,
    severity: 'severe',
  }

  const normalized = normalizeObservation(raw, 'citizen')
  assert.equal(normalized.source, 'citizen')
  assert.equal(normalized.category, 'ROAD_DAMAGE')
  assert.equal(normalized.severity, 'high')
  assert.equal(normalized.lat, 37.7749)
  assert.equal(normalized.lng, -122.4194)
})

test('haversineDistanceMeters calculates accurate distance', () => {
  // Distance between 2 close points in SF (~111 meters)
  const dist = haversineDistanceMeters(37.7749, -122.4194, 37.7759, -122.4194)
  assert.ok(dist > 100 && dist < 120)
})

test('clusterObservations groups close observations in same time window', () => {
  const obsList = [
    {
      id: '1',
      category: 'ROAD_DAMAGE',
      lat: 37.7749,
      lng: -122.4194,
      timestamp: '2026-03-13T10:00:00Z',
    },
    {
      id: '2',
      category: 'ROAD_DAMAGE',
      lat: 37.7750, // ~11 meters away
      lng: -122.4194,
      timestamp: '2026-03-13T10:30:00Z', // 30 mins apart
    },
    {
      id: '3',
      category: 'ROAD_DAMAGE',
      lat: 37.8000, // far away (~2.8 km)
      lng: -122.4194,
      timestamp: '2026-03-13T10:00:00Z',
    },
  ]

  const clusters = clusterObservations(obsList, 50, 24)
  assert.equal(clusters.length, 2)
  assert.equal(clusters[0].length, 2)
  assert.equal(clusters[1].length, 1)
})
