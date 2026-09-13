import test from 'node:test'
import assert from 'node:assert/strict'
import { requireRole } from '../src/middleware/auth.middleware.js'

test('requireRole middleware allows user with correct role', () => {
  const middleware = requireRole('authority', 'admin')
  const req = { user: { role: 'authority' } }
  let nextCalled = false
  const next = () => { nextCalled = true }
  const res = {}

  middleware(req, res, next)
  assert.equal(nextCalled, true)
})

test('requireRole middleware blocks user without required role', () => {
  const middleware = requireRole('authority', 'admin')
  const req = { user: { role: 'citizen' } }
  let statusCode = null
  let jsonResult = null

  const res = {
    status(code) {
      statusCode = code
      return this
    },
    json(obj) {
      jsonResult = obj
      return this
    },
  }
  const next = () => {}

  middleware(req, res, next)
  assert.equal(statusCode, 403)
  assert.match(jsonResult.error, /Access denied/)
})

test('requireRole middleware blocks unauthenticated requests', () => {
  const middleware = requireRole('authority', 'admin')
  const req = {}
  let statusCode = null

  const res = {
    status(code) {
      statusCode = code
      return this
    },
    json(obj) {
      return this
    },
  }

  middleware(req, res, () => {})
  assert.equal(statusCode, 401)
})
