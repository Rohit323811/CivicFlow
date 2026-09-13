import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  weatherConfigFromEnv,
  validateWeatherConfig,
  mapOpenWeatherAlerts,
} from '../../collectors/weather.js'
import {
  osmConfigFromEnv,
  validateOsmConfig,
  buildOverpassQuery,
  mapOverpassElements,
} from '../../collectors/osm.js'
import { runCollector } from '../../collectors/collectorRunner.js'
import { __setBackendClientForTests, __resetBackendClientForTests } from '../src/config/supabase.js'
import { makeFakeClient } from './fakes.js'

describe('weather collector', () => {
  test('config from env + validation errors', () => {
    const config = weatherConfigFromEnv({ WEATHER_API_KEY: 'k', WEATHER_LAT: '12.9', WEATHER_LNG: '77.6' })
    assert.equal(config.apiKey, 'k')
    assert.equal(config.lat, 12.9)
    assert.doesNotThrow(() => validateWeatherConfig(config))

    assert.throws(() => validateWeatherConfig(weatherConfigFromEnv({})), /WEATHER_API_KEY/)
    assert.throws(
      () => validateWeatherConfig(weatherConfigFromEnv({ WEATHER_API_KEY: 'k', WEATHER_LAT: 'x', WEATHER_LNG: '1' })),
      /WEATHER_LAT/
    )
  })

  test('maps One Call alerts into raw records', () => {
    const records = mapOpenWeatherAlerts({
      lat: 12.9,
      lon: 77.6,
      alerts: [
        {
          event: 'Flood Advisory',
          description: 'Urban flooding',
          sender_name: 'IMD',
          start: 1767225600,
          end: 1767312000,
          tags: ['rain'],
        },
      ],
    })
    assert.equal(records.length, 1)
    assert.equal(records[0].lat, 12.9)
    assert.equal(records[0].lng, 77.6)
    assert.equal(records[0].event, 'Flood Advisory')
    assert.equal(records[0].start, new Date(1767225600 * 1000).toISOString())
    assert.deepEqual(records[0].tags, ['rain'])
  })
})

describe('osm collector', () => {
  test('bbox validation', () => {
    assert.doesNotThrow(() => validateOsmConfig({ bbox: '12.9,77.5,13.1,77.7' }))
    assert.throws(() => validateOsmConfig({ bbox: 'oops' }), /OSM_BBOX/)
    assert.throws(() => validateOsmConfig({ bbox: '13.1,77.7,12.9,77.5' }), /min values/)
  })

  test('config defaults and override', () => {
    const config = osmConfigFromEnv({ OSM_BBOX: '1,2,3,4', OSM_OVERPASS_URL: 'https://example.com/api' })
    assert.equal(config.bbox, '1,2,3,4')
    assert.equal(config.endpoint, 'https://example.com/api')
    assert.match(osmConfigFromEnv({}).bbox, /^12\.90,/)
  })

  test('builds an Overpass QL query for the bbox', () => {
    const query = buildOverpassQuery('12.90,77.50,13.10,77.70')
    assert.match(query, /\[out:json\]/)
    assert.match(query, /node\["hazard"\]\(12\.90,77\.50,13\.10,77\.70\)/)
    assert.match(query, /out center 200;/)
  })

  test('maps Overpass elements, dropping records without coordinates', () => {
    const records = mapOverpassElements({
      elements: [
        { type: 'node', id: 1, lat: 12.97, lon: 77.59, tags: { hazard: 'hole' } },
        { type: 'way', id: 2, center: { lat: 12.98, lon: 77.60 }, tags: { note: 'flooding here' } },
        { type: 'node', id: 3, tags: { hazard: 'hole' } }, // no coords -> dropped
      ],
    })
    assert.equal(records.length, 2)
    assert.equal(records[0].id, 1)
    assert.equal(records[1].lat, 12.98)
    assert.equal(records[1].lon, 77.60)
    assert.deepEqual(records[1].tags, { note: 'flooding here' })
  })
})

// ---------------------------------------------------------------------------
// collectorRunner bookkeeping
// ---------------------------------------------------------------------------
describe('runCollector', () => {
  const RAW = [
    { type: 'node', id: 1, lat: 12.97, lon: 77.59, tags: { hazard: 'hole' } },
    { type: 'node', id: 2, lat: 12.98, lon: 77.60, tags: { note: 'pothole near school' } },
    { type: 'node', id: 3, tags: { hazard: 'hole' } }, // invalid -> normalization error path
  ]

  function scriptedClient() {
    const calls = { runsOpened: 0, runsClosed: [], rawInserted: 0, observationsInserted: 0, sourcesCreated: 0 }
    const client = makeFakeClient((state) => {
      if (state.table === 'data_sources' && state.op === 'select') {
        return { data: null, error: { message: 'no rows' } }
      }
      if (state.table === 'data_sources' && state.op === 'insert') {
        calls.sourcesCreated += 1
        return { data: { id: 'src-1', name: 'openstreetmap', type: 'osm', url: null }, error: null }
      }
      if (state.table === 'source_runs' && state.op === 'insert') {
        calls.runsOpened += 1
        return { data: { id: 'run-1' }, error: null }
      }
      if (state.table === 'source_runs' && state.op === 'update') {
        calls.runsClosed.push(state.values.status)
        return { data: null, error: null }
      }
      if (state.table === 'raw_records' && state.op === 'insert') {
        calls.rawInserted += state.values.length
        return { data: null, error: null }
      }
      if (state.table === 'observations' && state.op === 'insert') {
        calls.observationsInserted += state.values.length
        return { data: null, error: null }
      }
      throw new Error(`unexpected query: ${state.table} ${state.op}`)
    })
    return { client, calls }
  }

  test('stores raw records, normalizes, and closes the run as success', async () => {
    const { client, calls } = scriptedClient()
    __setBackendClientForTests(client)
    try {
      const summary = await runCollector({
        sourceName: 'openstreetmap',
        sourceType: 'osm',
        fetchFn: () => RAW,
        runMatching: false,
        runAnalysis: false,
      })

      assert.equal(summary.records_fetched, 3)
      assert.equal(summary.raw_records_stored, 3)
      assert.equal(summary.observations_stored, 2) // the coord-less record is skipped
      assert.equal(calls.runsOpened, 1)
      assert.deepEqual(calls.runsClosed, ['success'])
      assert.equal(calls.sourcesCreated, 1)
      assert.equal(summary.errors.length, 0)
    } finally {
      __resetBackendClientForTests()
    }
  })

  test('marks the run failed when fetching throws', async () => {
    const { client, calls } = scriptedClient()
    __setBackendClientForTests(client)
    try {
      await assert.rejects(
        runCollector({
          sourceName: 'openstreetmap',
          sourceType: 'osm',
          fetchFn: () => {
            throw new Error('overpass is down')
          },
          runMatching: false,
          runAnalysis: false,
        }),
        /overpass is down/
      )
      assert.deepEqual(calls.runsClosed, ['failed'])
    } finally {
      __resetBackendClientForTests()
    }
  })

  test('503 without a backend client', async () => {
    __resetBackendClientForTests()
    await assert.rejects(
      runCollector({ sourceName: 'x', sourceType: 'osm', fetchFn: () => [] }),
      /SUPABASE_SERVICE_ROLE_KEY/
    )
  })
})
