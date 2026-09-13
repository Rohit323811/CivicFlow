import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { normalizeCategory, isKnownCategory } from '../src/ingestion/categoryMap.js'
import {
  normalizeObservation,
  normalizeBatch,
  ObservationValidationError,
} from '../src/ingestion/observationSchema.js'
import { normalizeWeatherAlert, normalizeOsmRecord, normalizeRecord } from '../src/ingestion/normalizers/index.js'
import { clusterObservations, deduplicateObservations } from '../src/ingestion/dedup.js'

// ---------------------------------------------------------------------------
// Category normalization
// ---------------------------------------------------------------------------
describe('categoryMap', () => {
  test('maps raw labels to canonical categories', () => {
    assert.equal(normalizeCategory('pothole'), 'ROAD_DAMAGE')
    assert.equal(normalizeCategory('Pothole'), 'ROAD_DAMAGE')
    assert.equal(normalizeCategory('  road   defect '), 'ROAD_DAMAGE')
    assert.equal(normalizeCategory('Water Leak'), 'WATER_LEAK')
    assert.equal(normalizeCategory('broken streetlight'), 'STREETLIGHT')
    assert.equal(normalizeCategory('illegal dumping'), 'GARBAGE')
    assert.equal(normalizeCategory('flood'), 'FLOODING')
    assert.equal(normalizeCategory('clogged drain'), 'DRAINAGE')
    assert.equal(normalizeCategory('signal out'), 'TRAFFIC_SIGNAL')
    assert.equal(normalizeCategory('fallen sign'), 'DAMAGED_SIGN')
  })

  test('already-canonical values pass through; unknown maps to OTHER', () => {
    assert.equal(normalizeCategory('ROAD_DAMAGE'), 'ROAD_DAMAGE')
    assert.equal(normalizeCategory('volcano'), 'OTHER')
    assert.equal(normalizeCategory(''), 'OTHER')
    assert.equal(normalizeCategory(null), 'OTHER')
  })

  test('isKnownCategory distinguishes mapped vs unknown labels', () => {
    assert.equal(isKnownCategory('pothole'), true)
    assert.equal(isKnownCategory('volcano'), false)
  })
})

// ---------------------------------------------------------------------------
// Observation schema
// ---------------------------------------------------------------------------
describe('observationSchema', () => {
  test('normalizes a raw record into the canonical shape', () => {
    const observation = normalizeObservation(
      {
        category: 'pothole',
        description: 'Deep hole',
        lat: '12.97',
        lng: '77.59',
        severity: 'major',
        confidence: 88.4,
        timestamp: '2026-01-15T10:00:00Z',
        evidence: { photo: 'x.jpg' },
      },
      { source: 'citizen_report', sourceRecordId: 'raw-1' }
    )

    assert.equal(observation.source, 'citizen_report')
    assert.equal(observation.source_record_id, 'raw-1')
    assert.equal(observation.category, 'ROAD_DAMAGE')
    assert.equal(observation.lat, 12.97)
    assert.equal(observation.lng, 77.59)
    assert.equal(observation.severity, 'high')
    assert.equal(observation.confidence, 88.4)
    assert.equal(observation.timestamp, '2026-01-15T10:00:00.000Z')
    assert.deepEqual(observation.evidence, { photo: 'x.jpg' })
  })

  test('rejects invalid coordinates and timestamps', () => {
    assert.throws(
      () => normalizeObservation({ category: 'pothole', lat: 95, lng: 10 }, { source: 'osm' }),
      ObservationValidationError
    )
    assert.throws(
      () => normalizeObservation({ category: 'pothole', lat: 10, lng: 200 }, { source: 'osm' }),
      ObservationValidationError
    )
    assert.throws(
      () => normalizeObservation({ category: 'pothole', lat: 1, lng: 1, timestamp: 'not-a-date' }, { source: 'osm' }),
      ObservationValidationError
    )
    assert.throws(() => normalizeObservation({ category: 'pothole', lat: 1, lng: 1 }, { source: 'alien' }))
  })

  test('clamps confidence and defaults severity/timestamp', () => {
    const observation = normalizeObservation(
      { category: 'pothole', lat: 1, lng: 2, confidence: 250 },
      { source: 'citizen_report' }
    )
    assert.equal(observation.confidence, 100)
    assert.equal(observation.severity, 'low')
    assert.ok(!Number.isNaN(new Date(observation.timestamp).getTime()))
    assert.equal(observation.source_record_id, null)
  })

  test('normalizeBatch collects errors instead of throwing', () => {
    const { observations, errors } = normalizeBatch(
      [
        { category: 'pothole', lat: 1, lng: 2 },
        { category: 'pothole', lat: 999, lng: 2 },
        { category: 'flood', lat: 3, lng: 4 },
      ],
      { source: 'osm' }
    )
    assert.equal(observations.length, 2)
    assert.equal(errors.length, 1)
    assert.equal(errors[0].index, 1)
  })
})

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------
describe('normalizers', () => {
  test('weather alert maps flood events to FLOODING observations', () => {
    const observation = normalizeWeatherAlert({
      event: 'Flood Advisory',
      description: 'Urban flooding possible',
      lat: 12.9,
      lon: 77.6,
      start: '2026-01-10T00:00:00Z',
      sender_name: 'IMD',
      tags: ['rain'],
    })
    assert.equal(observation.source, 'weather')
    assert.equal(observation.category, 'FLOODING')
    assert.equal(observation.severity, 'low')
    assert.equal(observation.evidence.provider, 'IMD')
  })

  test('weather severity escalates with alert text', () => {
    const observation = normalizeWeatherAlert({
      event: 'Severe Thunderstorm Warning',
      lat: 1,
      lon: 2,
    })
    assert.equal(observation.severity, 'high')
  })

  test('OSM note maps hazard tags to categories', () => {
    const observation = normalizeOsmRecord({
      id: 42,
      lat: 12.98,
      lon: 77.61,
      date_created: '2026-01-11T08:00:00Z',
      text: 'Large pothole near bus stop',
    })
    assert.equal(observation.source, 'osm')
    assert.equal(observation.category, 'ROAD_DAMAGE')
    assert.equal(observation.source_record_id, 'node/42')
    assert.equal(observation.evidence.osm_id, 42)
  })

  test('registry dispatches by source type', () => {
    const observation = normalizeRecord('osm', {
      id: 7,
      type: 'way',
      lat: 1,
      lon: 2,
      tags: { hazard: 'hole' },
    })
    assert.equal(observation.category, 'ROAD_DAMAGE')
    assert.equal(observation.source_record_id, 'way/7')
    assert.throws(() => normalizeRecord('unknown-source', {}))
  })
})

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------
describe('dedup clustering', () => {
  const base = { category: 'ROAD_DAMAGE', severity: 'low', confidence: 60, source: 'citizen_report' }
  const t = (h) => new Date(Date.UTC(2026, 0, 1, 10) + h * 3600000).toISOString()

  test('clusters nearby, same-category, close-in-time observations', () => {
    const clusters = clusterObservations([
      { ...base, lat: 12.971, lng: 77.591, timestamp: t(0) },
      { ...base, lat: 12.9711, lng: 77.5911, timestamp: t(1) }, // ~15m away
      { ...base, lat: 12.975, lng: 77.595, timestamp: t(2) }, // ~600m away
    ])
    assert.equal(clusters.length, 2)
    const sizes = clusters.map((c) => c.members.length).sort((a, b) => b - a)
    assert.deepEqual(sizes, [2, 1])
  })

  test('same location but different category stays separate', () => {
    const clusters = clusterObservations([
      { ...base, lat: 12.971, lng: 77.591, timestamp: t(0) },
      { ...base, category: 'GARBAGE', lat: 12.971, lng: 77.591, timestamp: t(0) },
    ])
    assert.equal(clusters.length, 2)
  })

  test('same location outside the time window stays separate', () => {
    const clusters = clusterObservations([
      { ...base, lat: 12.971, lng: 77.591, timestamp: t(0) },
      { ...base, lat: 12.971, lng: 77.591, timestamp: t(72) }, // 72h later
    ])
    assert.equal(clusters.length, 2)
  })

  test('radius option widens clustering', () => {
    const observations = [
      { ...base, lat: 12.971, lng: 77.591, timestamp: t(0) },
      { ...base, lat: 12.975, lng: 77.595, timestamp: t(1) },
    ]
    assert.equal(clusterObservations(observations).length, 2)
    assert.equal(clusterObservations(observations, { radiusMeters: 1000 }).length, 1)
  })

  test('deduplicateObservations returns representatives and absorbed duplicates', () => {
    const { unique, duplicates, clusters } = deduplicateObservations([
      { ...base, id: 'a', lat: 12.971, lng: 77.591, timestamp: t(0) },
      { ...base, id: 'b', lat: 12.9711, lng: 77.5911, timestamp: t(1) },
      { ...base, id: 'c', lat: 12.9712, lng: 77.5912, timestamp: t(2) },
      { ...base, id: 'd', lat: 20, lng: 20, timestamp: t(3) },
    ])

    assert.equal(unique.length, 2)
    assert.equal(clusters.length, 2)
    assert.equal(duplicates.length, 2)
    assert.equal(unique[0].id, 'a') // earliest becomes representative
    assert.ok(duplicates.every((d) => d.kept.id === 'a'))
  })

  test('centroid recenters as members join', () => {
    const clusters = clusterObservations([
      { ...base, lat: 12.0, lng: 77.0, timestamp: t(0) },
      { ...base, lat: 12.0003, lng: 77.0, timestamp: t(1) }, // ~33m away
    ])
    assert.equal(clusters.length, 1)
    assert.ok(Math.abs(clusters[0].centroid[0] - 12.00015) < 1e-6)
  })
})
