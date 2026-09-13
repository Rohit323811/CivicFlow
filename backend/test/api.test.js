import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'

import app from '../src/app.js'
import {
  __setBackendClientForTests,
  __resetBackendClientForTests,
  __setAuthClientForTests,
  __resetAuthClientForTests,
} from '../src/config/supabase.js'
import { makeFakeClient, makeAuthClient } from './fakes.js'

const CITIZEN_PROFILE = { id: 'p-citizen', role: 'citizen', name: 'Citizen', email: 'c@civicflow.local' }
const AUTHORITY_PROFILE = { id: 'p-authority', role: 'authority', name: 'Authority', email: 'a@civicflow.local' }

const AUTH_USER = { id: 'u-1', email: 'c@civicflow.local' }

function profileHandler(profile) {
  return (state) => {
    assert.equal(state.table, 'profiles')
    return { data: profile, error: null }
  }
}

async function testWithUser(profile, fn) {
  __setAuthClientForTests(makeAuthClient({ data: { user: AUTH_USER }, error: null }))
  __setBackendClientForTests(makeFakeClient(profileHandler(profile)))
  try {
    return await fn()
  } finally {
    __resetAuthClientForTests()
    __resetBackendClientForTests()
  }
}

beforeEach(() => {
  __resetAuthClientForTests()
  __resetBackendClientForTests()
})

afterEach(() => {
  __resetAuthClientForTests()
  __resetBackendClientForTests()
})

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
describe('GET /api/health', () => {
  test('returns ok', async () => {
    const res = await request(app).get('/api/health')
    assert.equal(res.status, 200)
    assert.equal(res.body.status, 'ok')
    assert.equal(res.body.service, 'civicflow-api')
  })
})

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
describe('auth middleware', () => {
  test('401 without a token', async () => {
    const res = await request(app).post('/api/reports').send({})
    assert.equal(res.status, 401)
  })

  test('503 when auth is unconfigured', async () => {
    __resetAuthClientForTests()
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', 'Bearer some-token')
      .send({})
    assert.equal(res.status, 503)
  })

  test('403 when profile is missing', async () => {
    __setAuthClientForTests(makeAuthClient({ data: { user: AUTH_USER }, error: null }))
    __setBackendClientForTests(
      makeFakeClient(() => ({ data: null, error: { message: 'no rows' } }))
    )
    try {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', 'Bearer some-token')
        .send({})
      assert.equal(res.status, 403)
    } finally {
      __resetAuthClientForTests()
      __resetBackendClientForTests()
    }
  })
})

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
describe('POST /api/reports', () => {
  test('creates an observation and returns the auto-created potential issue', async () => {
    await testWithUser(CITIZEN_PROFILE, async () => {
      __setBackendClientForTests(
        makeFakeClient((state) => {
          if (state.table === 'profiles') return { data: CITIZEN_PROFILE, error: null }
          if (state.table === 'observations' && state.op === 'insert') {
            return {
              data: { id: 'obs-1', source: 'citizen_report', category: 'ROAD_DAMAGE', severity: 'low' },
              error: null,
            }
          }
          if (state.table === 'issue_observations') {
            return { data: { issue_id: 'issue-1' }, error: null }
          }
          if (state.table === 'issues') {
            return { data: { id: 'issue-1', status: 'potential', category: 'ROAD_DAMAGE' }, error: null }
          }
          throw new Error(`unexpected query: ${state.table} ${state.op}`)
        })
      )

      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', 'Bearer token')
        .send({ category: 'ROAD_DAMAGE', description: 'Pothole', lat: 12.97, lng: 77.59 })

      assert.equal(res.status, 201)
      assert.equal(res.body.observation.source, 'citizen_report')
      assert.equal(res.body.issue.status, 'potential')
    })
  })

  test('400 on invalid category', async () => {
    await testWithUser(CITIZEN_PROFILE, async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', 'Bearer token')
        .send({ category: 'ALIENS', lat: 12.97, lng: 77.59 })
      assert.equal(res.status, 400)
    })
  })

  test('400 on out-of-range coordinates', async () => {
    await testWithUser(CITIZEN_PROFILE, async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', 'Bearer token')
        .send({ category: 'GARBAGE', lat: 999, lng: 77.59 })
      assert.equal(res.status, 400)
    })
  })

  test('400 on missing required fields', async () => {
    await testWithUser(CITIZEN_PROFILE, async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', 'Bearer token')
        .send({ description: 'no category or coords' })
      assert.equal(res.status, 400)
      assert.match(res.body.error, /category/)
    })
  })
})

// ---------------------------------------------------------------------------
// Issues: list + detail
// ---------------------------------------------------------------------------
describe('GET /api/issues', () => {
  const ROWS = [
    { id: 'a', status: 'potential', category: 'GARBAGE', severity: 'low', lat: 1, lng: 1 },
    { id: 'b', status: 'verified', category: 'GARBAGE', severity: 'high', lat: 2, lng: 2 },
    { id: 'c', status: 'merged', category: 'WATER_LEAK', severity: 'low', lat: 3, lng: 3 },
  ]

  test('anonymous viewers never see potential/merged rows', async () => {
    __setBackendClientForTests(
      makeFakeClient((state) => {
        assert.equal(state.table, 'issues')
        return { data: ROWS, error: null }
      })
    )
    try {
      const res = await request(app).get('/api/issues')
      assert.equal(res.status, 200)
      assert.deepEqual(res.body.issues.map((i) => i.id), ['b'])
    } finally {
      __resetBackendClientForTests()
    }
  })

  test('authority viewers see every status', async () => {
    await testWithUser(AUTHORITY_PROFILE, async () => {
      __setBackendClientForTests(
        makeFakeClient((state) => {
          if (state.table === 'profiles') return { data: AUTHORITY_PROFILE, error: null }
          assert.equal(state.table, 'issues')
          return { data: ROWS, error: null }
        })
      )
      try {
        const res = await request(app).get('/api/issues').set('Authorization', 'Bearer token')
        assert.equal(res.status, 200)
        assert.equal(res.body.issues.length, 3)
      } finally {
        __resetBackendClientForTests()
      }
    })
  })

  test('400 on invalid filter enum', async () => {
    const res = await request(app).get('/api/issues?severity=apocalyptic')
    assert.equal(res.status, 400)
  })

  test('400 on inverted bounds', async () => {
    const res = await request(app).get('/api/issues?minLat=10&maxLat=5&minLng=0&maxLng=1')
    assert.equal(res.status, 400)
  })
})

describe('GET /api/issues/:id', () => {
  test('400 on malformed uuid', async () => {
    const res = await request(app).get('/api/issues/not-a-uuid')
    assert.equal(res.status, 400)
  })

  test('404 for unknown issue', async () => {
    __setBackendClientForTests(
      makeFakeClient(() => ({ data: null, error: { message: 'no rows' } }))
    )
    try {
      const res = await request(app).get('/api/issues/3f0d3a52-6bd8-4b6a-9d7d-2b0f9be18c01')
      assert.equal(res.status, 404)
    } finally {
      __resetBackendClientForTests()
    }
  })

  test('404 (not 403) for a potential issue viewed anonymously', async () => {
    __setBackendClientForTests(
      makeFakeClient(() => ({
        data: { id: 'x', status: 'potential' },
        error: null,
      }))
    )
    try {
      const res = await request(app).get('/api/issues/3f0d3a52-6bd8-4b6a-9d7d-2b0f9be18c02')
      assert.equal(res.status, 404)
    } finally {
      __resetBackendClientForTests()
    }
  })
})

// ---------------------------------------------------------------------------
// Lifecycle actions
// ---------------------------------------------------------------------------
describe('POST /api/issues/:id/verify', () => {
  const ISSUE_ID = '3f0d3a52-6bd8-4b6a-9d7d-2b0f9be18c10'

  test('citizen is forbidden', async () => {
    await testWithUser(CITIZEN_PROFILE, async () => {
      const res = await request(app)
        .post(`/api/issues/${ISSUE_ID}/verify`)
        .set('Authorization', 'Bearer token')
        .send({ decision: 'verified' })
      assert.equal(res.status, 403)
    })
  })

  test('authority verifies a potential issue and records the event', async () => {
    await testWithUser(AUTHORITY_PROFILE, async () => {
      const events = []
      __setBackendClientForTests(
        makeFakeClient((state) => {
          if (state.table === 'profiles') return { data: AUTHORITY_PROFILE, error: null }
          if (state.table === 'issues' && state.op === 'select') {
            return { data: { id: ISSUE_ID, status: 'potential' }, error: null }
          }
          if (state.table === 'issues' && state.op === 'update') {
            assert.deepEqual(state.values, { status: 'verified' })
            return { data: { id: ISSUE_ID, status: 'verified' }, error: null }
          }
          if (state.table === 'verification_events' && state.op === 'insert') {
            events.push(state.values)
            return { data: null, error: null }
          }
          throw new Error(`unexpected query: ${state.table} ${state.op}`)
        })
      )
      try {
        const res = await request(app)
          .post(`/api/issues/${ISSUE_ID}/verify`)
          .set('Authorization', 'Bearer token')
          .send({ decision: 'verified', notes: 'checked on site' })
        assert.equal(res.status, 200)
        assert.equal(res.body.status, 'verified')
        assert.equal(events.length, 1)
        assert.equal(events[0].action, 'verified')
        assert.equal(events[0].actor_id, AUTHORITY_PROFILE.id)
      } finally {
        __resetBackendClientForTests()
      }
    })
  })

  test('merge requires mergeIntoIssueId', async () => {
    await testWithUser(AUTHORITY_PROFILE, async () => {
      __setBackendClientForTests(
        makeFakeClient((state) => {
          if (state.table === 'profiles') return { data: AUTHORITY_PROFILE, error: null }
          if (state.table === 'issues') return { data: { id: ISSUE_ID, status: 'potential' }, error: null }
          throw new Error(`unexpected query: ${state.table} ${state.op}`)
        })
      )
      try {
        const res = await request(app)
          .post(`/api/issues/${ISSUE_ID}/verify`)
          .set('Authorization', 'Bearer token')
          .send({ decision: 'merged' })
        assert.equal(res.status, 400)
      } finally {
        __resetBackendClientForTests()
      }
    })
  })
})

describe('POST /api/issues/:id/status', () => {
  const ISSUE_ID = '3f0d3a52-6bd8-4b6a-9d7d-2b0f9be18c20'

  test('409 on an illegal transition (verified -> resolved)', async () => {
    await testWithUser(AUTHORITY_PROFILE, async () => {
      __setBackendClientForTests(
        makeFakeClient((state) => {
          if (state.table === 'profiles') return { data: AUTHORITY_PROFILE, error: null }
          if (state.table === 'issues') return { data: { id: ISSUE_ID, status: 'verified' }, error: null }
          throw new Error(`unexpected query: ${state.table} ${state.op}`)
        })
      )
      try {
        const res = await request(app)
          .post(`/api/issues/${ISSUE_ID}/status`)
          .set('Authorization', 'Bearer token')
          .send({ status: 'resolved' })
        assert.equal(res.status, 409)
      } finally {
        __resetBackendClientForTests()
      }
    })
  })

  test('legal transition assigned -> in_progress succeeds', async () => {
    await testWithUser(AUTHORITY_PROFILE, async () => {
      __setBackendClientForTests(
        makeFakeClient((state) => {
          if (state.table === 'profiles') return { data: AUTHORITY_PROFILE, error: null }
          if (state.table === 'issues' && state.op === 'select') {
            return { data: { id: ISSUE_ID, status: 'assigned' }, error: null }
          }
          if (state.table === 'issues' && state.op === 'update') {
            return { data: { id: ISSUE_ID, status: 'in_progress' }, error: null }
          }
          throw new Error(`unexpected query: ${state.table} ${state.op}`)
        })
      )
      try {
        const res = await request(app)
          .post(`/api/issues/${ISSUE_ID}/status`)
          .set('Authorization', 'Bearer token')
          .send({ status: 'in_progress' })
        assert.equal(res.status, 200)
        assert.equal(res.body.status, 'in_progress')
      } finally {
        __resetBackendClientForTests()
      }
    })
  })
})

describe('POST /api/issues/:id/assign', () => {
  const ISSUE_ID = '3f0d3a52-6bd8-4b6a-9d7d-2b0f9be18c30'
  const DEPT_ID = 'aa0d3a52-6bd8-4b6a-9d7d-2b0f9be18c31'

  test('assigns department and auto-advances potential -> assigned', async () => {
    await testWithUser(AUTHORITY_PROFILE, async () => {
      __setBackendClientForTests(
        makeFakeClient((state) => {
          if (state.table === 'profiles') return { data: AUTHORITY_PROFILE, error: null }
          if (state.table === 'issues' && state.op === 'select') {
            return { data: { id: ISSUE_ID, status: 'potential' }, error: null }
          }
          if (state.table === 'departments') return { data: { id: DEPT_ID, name: 'Roads' }, error: null }
          if (state.table === 'issues' && state.op === 'update') {
            assert.deepEqual(state.values, { department_id: DEPT_ID, status: 'assigned' })
            return { data: { id: ISSUE_ID, status: 'assigned', department_id: DEPT_ID }, error: null }
          }
          if (state.table === 'verification_events') return { data: null, error: null }
          throw new Error(`unexpected query: ${state.table} ${state.op}`)
        })
      )
      try {
        const res = await request(app)
          .post(`/api/issues/${ISSUE_ID}/assign`)
          .set('Authorization', 'Bearer token')
          .send({ departmentId: DEPT_ID })
        assert.equal(res.status, 200)
        assert.equal(res.body.status, 'assigned')
      } finally {
        __resetBackendClientForTests()
      }
    })
  })

  test('400 on unknown department', async () => {
    await testWithUser(AUTHORITY_PROFILE, async () => {
      __setBackendClientForTests(
        makeFakeClient((state) => {
          if (state.table === 'profiles') return { data: AUTHORITY_PROFILE, error: null }
          if (state.table === 'issues') return { data: { id: ISSUE_ID, status: 'verified' }, error: null }
          if (state.table === 'departments') return { data: null, error: { message: 'no rows' } }
          throw new Error(`unexpected query: ${state.table} ${state.op}`)
        })
      )
      try {
        const res = await request(app)
          .post(`/api/issues/${ISSUE_ID}/assign`)
          .set('Authorization', 'Bearer token')
          .send({ departmentId: DEPT_ID })
        assert.equal(res.status, 400)
      } finally {
        __resetBackendClientForTests()
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
describe('GET /api/analytics/summary', () => {
  test('401 unauthenticated', async () => {
    const res = await request(app).get('/api/analytics/summary')
    assert.equal(res.status, 401)
  })

  test('403 for citizens', async () => {
    await testWithUser(CITIZEN_PROFILE, async () => {
      const res = await request(app).get('/api/analytics/summary').set('Authorization', 'Bearer token')
      assert.equal(res.status, 403)
    })
  })

  test('returns aggregates for authority', async () => {
    await testWithUser(AUTHORITY_PROFILE, async () => {
      __setBackendClientForTests(
        makeFakeClient((state) => {
          if (state.table === 'profiles') return { data: AUTHORITY_PROFILE, error: null }
          if (state.table === 'issues') {
            return {
              data: [
                { id: '1', category: 'GARBAGE', severity: 'low', status: 'verified', department_id: null, created_at: new Date().toISOString() },
              ],
              error: null,
            }
          }
          if (state.table === 'observations') {
            return { data: [{ id: 'o1', source: 'citizen_report', created_at: new Date().toISOString() }], error: null }
          }
          if (state.table === 'source_runs') return { data: [], error: null }
          if (state.table === 'departments') return { data: [{ id: 'd1', name: 'Roads' }], error: null }
          throw new Error(`unexpected query: ${state.table} ${state.op}`)
        })
      )
      try {
        const res = await request(app).get('/api/analytics/summary').set('Authorization', 'Bearer token')
        assert.equal(res.status, 200)
        assert.equal(res.body.totals.issues, 1)
        assert.equal(res.body.totals.observations, 1)
        assert.equal(res.body.by_category.GARBAGE, 1)
      } finally {
        __resetBackendClientForTests()
      }
    })
  })
})
