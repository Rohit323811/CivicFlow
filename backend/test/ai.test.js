import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { analyzeIncident, heuristicAnalysis, normalizeAnalysis, isAiConfigured } from '../src/services/ai/analysisService.js'
import {
  modeCategory,
  maxSeverity,
  recommendedDepartmentFor,
  potentialCauseFor,
} from '../src/services/ai/heuristics.js'
import { analyzeIssue, analyzePendingIssues } from '../src/services/aiAnalysis.service.js'
import { __setBackendClientForTests, __resetBackendClientForTests } from '../src/config/supabase.js'
import { makeFakeClient } from './fakes.js'

const HOUR = 3600000
// Recency is scored against the real wall clock inside heuristicAnalysis,
// so build timestamps relative to Date.now() to keep tests deterministic.
const now = Date.now()
const t = (hoursBeforeNow) => new Date(now - hoursBeforeNow * HOUR).toISOString()

const base = { category: 'ROAD_DAMAGE', source: 'citizen_report', severity: 'low', confidence: 60 }

function members() {
  return [
    { ...base, id: '1', lat: 12.971, lng: 77.591, timestamp: t(3), description: 'pothole' },
    { ...base, source: 'osm', id: '2', lat: 12.9714, lng: 77.5914, timestamp: t(2), description: 'road defect' },
    { ...base, severity: 'high', id: '3', lat: 12.9712, lng: 77.5912, timestamp: t(1), description: 'deep crack' },
  ]
}

describe('heuristics', () => {
  test('modeCategory picks the majority category', () => {
    assert.equal(modeCategory([{ category: 'GARBAGE' }, { category: 'GARBAGE' }, { category: 'OTHER' }]), 'GARBAGE')
    assert.equal(modeCategory([]), 'OTHER')
  })

  test('maxSeverity respects rank order', () => {
    assert.equal(maxSeverity([{ severity: 'medium' }, { severity: 'critical' }]), 'critical')
    assert.equal(maxSeverity([]), 'low')
  })

  test('department mapping covers the pipeline categories', () => {
    assert.equal(recommendedDepartmentFor('ROAD_DAMAGE'), 'Roads & Transport')
    assert.equal(recommendedDepartmentFor('FLOODING'), 'Disaster Management')
    assert.equal(recommendedDepartmentFor('STREETLIGHT'), 'Street Lighting')
    assert.equal(recommendedDepartmentFor('GARBAGE'), 'Sanitation & Waste')
  })

  test('weather evidence is cited for rain-related causes', () => {
    const cause = potentialCauseFor('FLOODING', [{ source: 'weather' }])
    assert.match(cause, /weather signals/)
    assert.doesNotMatch(potentialCauseFor('FLOODING', [{ source: 'citizen_report' }]), /weather signals/)
  })
})

describe('heuristicAnalysis', () => {
  test('returns the full analysis contract from observations only', () => {
    const analysis = heuristicAnalysis(members())
    assert.equal(analysis.category, 'ROAD_DAMAGE')
    // rank-max is 'high', then the 3+ corroboration bump escalates one step
    assert.equal(analysis.severity, 'critical')
    assert.equal(analysis.recommended_department, 'Roads & Transport')
    assert.equal(analysis.source, 'heuristic')
    assert.ok(analysis.confidence > 0 && analysis.confidence <= 95)
    assert.ok(analysis.potential_cause.length > 0)
    assert.ok(analysis.reasoning.length > 0)
    assert.equal(analysis.signals.distinct_sources, 2)
  })

  test('confidence is capped at 95 even with perfect evidence (bump applies)', () => {
    const analysis = heuristicAnalysis([
      { ...base, confidence: 100, lat: 1, lng: 2, timestamp: t(0.1) },
      { ...base, source: 'government', confidence: 100, lat: 1.0001, lng: 2, timestamp: t(0.2) },
      { ...base, source: 'osm', confidence: 100, lat: 1.0002, lng: 2, timestamp: t(0.3) },
      { ...base, source: 'ai', confidence: 100, lat: 1.0003, lng: 2, timestamp: t(0.4) },
    ])
    assert.equal(analysis.confidence, 95)
  })

  test('3+ observations bump the severity one step', () => {
    const analysis = heuristicAnalysis([
      { ...base, severity: 'high', lat: 1, lng: 2, timestamp: t(1) },
      { ...base, severity: 'high', lat: 1.0001, lng: 2, timestamp: t(2) },
      { ...base, severity: 'high', lat: 1.0002, lng: 2, timestamp: t(3) },
    ])
    assert.equal(analysis.severity, 'critical')
  })
})

describe('analyzeIncident', () => {
  beforeEach(() => {
    delete process.env.AI_API_KEY
    delete process.env.AI_BASE_URL
  })

  test('uses the heuristic path when no AI key is set', async () => {
    const analysis = await analyzeIncident(members())
    assert.equal(analysis.source, 'heuristic')
  })

  test('isAiConfigured reflects the environment', () => {
    assert.equal(isAiConfigured(), false)
    process.env.AI_API_KEY = 'test-key'
    process.env.AI_BASE_URL = 'https://example.invalid/v1'
    assert.equal(isAiConfigured(), true)
  })

  test('falls back to heuristics when the provider fails', async () => {
    process.env.AI_API_KEY = 'test-key'
    process.env.AI_BASE_URL = 'http://127.0.0.1:9/v1' // nothing listens there
    const analysis = await analyzeIncident(members())
    assert.equal(analysis.source, 'heuristic')
  })
})

describe('normalizeAnalysis', () => {
  const signals = { distinct_sources: 2, observation_count: 3, agreement: 66.67, recency: 100 }

  test('validates and clamps provider output', () => {
    const result = normalizeAnalysis(
      { category: 'NOT_A_CATEGORY', severity: 'WILD', confidence: 250, potential_cause: 'x', reasoning: 'y' },
      members(),
      signals,
      'ai'
    )
    assert.equal(result.category, 'ROAD_DAMAGE') // mode of members
    assert.equal(result.severity, 'high') // rank-max of members
    assert.equal(result.confidence, 95)
    assert.equal(result.source, 'ai')
  })

  test('coerces non-numeric confidence to 0', () => {
    const result = normalizeAnalysis({ confidence: 'high' }, members(), signals, 'ai')
    assert.equal(result.confidence, 0)
  })
})

// ---------------------------------------------------------------------------
// aiAnalysis.service orchestration
// ---------------------------------------------------------------------------
describe('analyzeIssue', () => {
  const ISSUE_ID = '11111111-1111-1111-1111-111111111111'

  function scriptedClient() {
    const calls = { updates: [], history: [] }
    const client = makeFakeClient((state) => {
      if (state.table === 'issues' && state.op === 'select') {
        return { data: { id: ISSUE_ID, status: 'potential', severity: 'low', category: 'ROAD_DAMAGE' }, error: null }
      }
      if (state.table === 'issue_observations') {
        return {
          data: members().map((o) => ({ observations: o })),
          error: null,
        }
      }
      if (state.table === 'issues' && state.op === 'update') {
        calls.updates.push(state.values)
        return { data: null, error: null }
      }
      if (state.table === 'issue_history') {
        calls.history.push(state.values)
        return { data: null, error: null }
      }
      throw new Error(`unexpected query: ${state.table} ${state.op}`)
    })
    return { client, calls }
  }

  test('stores the analysis WITHOUT touching status (AI never verifies)', async () => {
    const { client, calls } = scriptedClient()
    __setBackendClientForTests(client)
    try {
      const result = await analyzeIssue(ISSUE_ID)
      assert.equal(result.status, 'potential') // unchanged
      assert.equal(calls.updates.length, 1)
      assert.equal('status' in calls.updates[0], false) // payload has no status
      assert.equal('ai_analysis' in calls.updates[0], true)
      assert.equal('ai_analyzed_at' in calls.updates[0], true)
      assert.ok(calls.history[0].status_change.includes('status unchanged'))
    } finally {
      __resetBackendClientForTests()
    }
  })

  test('503 when the backend client is unconfigured', async () => {
    __resetBackendClientForTests()
    await assert.rejects(analyzeIssue(ISSUE_ID), /SUPABASE_SERVICE_ROLE_KEY/)
  })
})

describe('analyzePendingIssues', () => {
  test('collects per-issue failures without aborting the batch', async () => {
    const client = makeFakeClient((state) => {
      if (state.table === 'issues' && state.op === 'select') {
        return { data: [{ id: 'a' }, { id: 'b' }], error: null }
      }
      if (state.table === 'issues' && state.op !== 'select') {
        return { data: null, error: { message: 'boom' } }
      }
      if (state.table === 'issue_observations') {
        return { data: [], error: null }
      }
      if (state.table === 'issue_history') {
        return { data: null, error: null }
      }
      throw new Error(`unexpected query: ${state.table} ${state.op}`)
    })
    __setBackendClientForTests(client)
    try {
      const results = await analyzePendingIssues()
      assert.equal(results.length, 2)
      assert.ok(results.every((r) => r.error !== undefined))
    } finally {
      __resetBackendClientForTests()
    }
  })
})
