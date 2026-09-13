import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { groupIntoIncidents } from '../src/matching/grouping.js'
import {
  scoreIncident,
  sourceComponent,
  agreementComponent,
  recencyComponent,
  maxSeverityOf,
} from '../src/matching/scoring.js'
import { __setBackendClientForTests, __resetBackendClientForTests } from '../src/config/supabase.js'
import { makeFakeClient } from './fakes.js'
import { matchUnlinkedObservations } from '../src/services/matching.service.js'

const HOUR = 3600000
const now = Date.UTC(2026, 0, 10, 12, 0, 0)
const t = (hoursBeforeNow) => new Date(now - hoursBeforeNow * HOUR).toISOString()

const base = { category: 'ROAD_DAMAGE', source: 'citizen_report', severity: 'low', confidence: 60 }

describe('groupIntoIncidents', () => {
  test('merges cross-source reports of the same problem into one incident', () => {
    const incidents = groupIntoIncidents(
      [
        { ...base, id: '1', lat: 12.971, lng: 77.591, timestamp: t(70) },
        { ...base, source: 'osm', id: '2', lat: 12.9715, lng: 77.5915, timestamp: t(50) }, // ~70m away
      ],
      { now }
    )
    assert.equal(incidents.length, 1)
    assert.equal(incidents[0].members.length, 2)
  })

  test('separate incidents beyond the incident radius', () => {
    const incidents = groupIntoIncidents(
      [
        { ...base, id: '1', lat: 12.971, lng: 77.591, timestamp: t(1) },
        { ...base, id: '2', lat: 12.975, lng: 77.595, timestamp: t(1) }, // ~600m
      ],
      { now }
    )
    assert.equal(incidents.length, 2)
  })
})

describe('scoreIncident', () => {
  test('distinct sources raise corroboration and confidence', () => {
    const single = scoreIncident(
      {
        members: [{ ...base, lat: 1, lng: 2, timestamp: t(1) }],
      },
      { now }
    )
    const corroborated = scoreIncident(
      {
        members: [
          { ...base, lat: 1, lng: 2, timestamp: t(1) },
          { ...base, source: 'government', lat: 1.0001, lng: 2, timestamp: t(2), confidence: 70 },
          { ...base, source: 'osm', lat: 1.0002, lng: 2, timestamp: t(3) },
        ],
      },
      { now }
    )
    assert.ok(corroborated.confidence > single.confidence)
    assert.equal(corroborated.signals.distinct_sources, 3)
  })

  test('confidence is capped at 95', () => {
    const scored = scoreIncident(
      {
        members: [
          { ...base, confidence: 100, lat: 1, lng: 2, timestamp: t(0.5) },
          { ...base, source: 'government', confidence: 100, lat: 1.0001, lng: 2, timestamp: t(1) },
          { ...base, source: 'weather', confidence: 100, lat: 1.0002, lng: 2, timestamp: t(2) },
          { ...base, source: 'ai', confidence: 100, lat: 1.0003, lng: 2, timestamp: t(3) },
        ],
      },
      { now }
    )
    assert.equal(scored.confidence, 95)
  })

  test('stale incidents lose recency', () => {
    const fresh = scoreIncident({ members: [{ ...base, lat: 1, lng: 2, timestamp: t(2) }] }, { now })
    const stale = scoreIncident({ members: [{ ...base, lat: 1, lng: 2, timestamp: t(24 * 60) }] }, { now })
    assert.ok(fresh.confidence > stale.confidence)
    assert.equal(recencyComponent(t(2), now), 100)
    assert.equal(recencyComponent(t(24 * 60), now), 10)
  })

  test('severity is the rank-max of members', () => {
    const scored = scoreIncident({
      members: [
        { ...base, severity: 'low', lat: 1, lng: 2, timestamp: t(1) },
        { ...base, severity: 'critical', lat: 1.0001, lng: 2, timestamp: t(2) },
      ],
    })
    assert.equal(scored.severity, 'critical')
    assert.equal(maxSeverityOf(['low', 'medium', 'high']), 'high')
    assert.equal(maxSeverityOf([]), null)
  })

  test('component helpers behave as specified', () => {
    assert.equal(sourceComponent(1), 50)
    assert.equal(sourceComponent(2), 75)
    assert.equal(sourceComponent(5), 95)
    assert.equal(agreementComponent(['high', 'high', 'low']), (2 / 3) * 100)
    assert.equal(agreementComponent(['low', 'low']), 100)
  })

  test('empty cluster scores zero', () => {
    const scored = scoreIncident({ members: [] })
    assert.equal(scored.confidence, 0)
    assert.equal(scored.severity, 'low')
  })
})

// ---------------------------------------------------------------------------
// matching.service against a fake backend client
// ---------------------------------------------------------------------------
describe('matchUnlinkedObservations', () => {
  const EXISTING_ISSUE = { id: 'issue-1', category: 'ROAD_DAMAGE', lat: 12.971, lng: 77.591, status: 'verified' }

  function scriptedClient() {
    const inserts = { issues: [], links: [], history: [] }
    const client = makeFakeClient((state) => {
      if (state.table === 'issue_observations' && state.op === 'select') {
        return { data: [], error: null }
      }
      if (state.table === 'observations') {
        return {
          data: [
            { id: 'obs-1', ...base, lat: 12.971, lng: 77.591, timestamp: t(3) },
            { id: 'obs-2', ...base, source: 'osm', lat: 12.9714, lng: 77.5914, timestamp: t(2) },
          ],
          error: null,
        }
      }
      if (state.table === 'issues' && state.op === 'select') {
        return { data: [EXISTING_ISSUE], error: null }
      }
      if (state.table === 'issues' && state.op === 'insert') {
        const row = { id: 'issue-new', ...state.values }
        inserts.issues.push(row)
        return { data: row, error: null }
      }
      if (state.table === 'issue_observations' && state.op === 'upsert') {
        inserts.links.push(...state.values)
        return { data: null, error: null }
      }
      if (state.table === 'issue_history') {
        inserts.history.push(state.values)
        return { data: null, error: null }
      }
      throw new Error(`unexpected query: ${state.table} ${state.op}`)
    })
    return { client, inserts }
  }

  test('links nearby observations to an existing open issue', async () => {
    const { client, inserts } = scriptedClient()
    __setBackendClientForTests(client)
    try {
      const summary = await matchUnlinkedObservations()
      assert.equal(summary.observations_considered, 2)
      assert.equal(summary.incidents, 1)
      assert.equal(summary.issues_matched, 1)
      assert.equal(summary.issues_created, 0)
      assert.equal(summary.links_created, 2)
      assert.equal(inserts.issues.length, 0)
      assert.ok(inserts.links.every((link) => link.issue_id === 'issue-1'))
    } finally {
      __resetBackendClientForTests()
    }
  })

  test('creates a potential issue when no open issue is nearby', async () => {
    const { client, inserts } = scriptedClient()
    __setBackendClientForTests(client)
    try {
      const summary = await matchUnlinkedObservations({ matchRadiusMeters: 1 })
      assert.equal(summary.issues_matched, 0)
      assert.equal(summary.issues_created, 1)
      assert.equal(inserts.issues[0].status, 'potential')
      assert.equal(inserts.issues[0].category, 'ROAD_DAMAGE')
      assert.ok(inserts.history.length >= 1)
    } finally {
      __resetBackendClientForTests()
    }
  })

  test('503 when the backend client is unconfigured', async () => {
    __resetBackendClientForTests()
    await assert.rejects(matchUnlinkedObservations(), /SUPABASE_SERVICE_ROLE_KEY/)
  })
})
