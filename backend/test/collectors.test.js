import test from 'node:test'
import assert from 'node:assert/strict'
import { runWeatherCollector } from '../../collectors/weather.collector.js'
import { runOsmCollector } from '../../collectors/osm.collector.js'

test('runWeatherCollector executes and normalizes weather observations', async () => {
  const res = await runWeatherCollector()
  assert.equal(res.status, 'completed')
  assert.equal(res.records_fetched, 1)
  assert.equal(res.records[0].source, 'weather')
  assert.equal(res.records[0].category, 'WATER_INFRASTRUCTURE')
})

test('runOsmCollector executes and normalizes OSM observations', async () => {
  const res = await runOsmCollector()
  assert.equal(res.status, 'completed')
  assert.equal(res.records_fetched, 1)
  assert.equal(res.records[0].source, 'osm')
  assert.equal(res.records[0].category, 'ROAD_DAMAGE')
})
