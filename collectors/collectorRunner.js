import { getBackendClient } from '../backend/src/config/supabase.js'
import { normalizeRecord } from '../backend/src/ingestion/normalizers/index.js'
import { matchUnlinkedObservations } from '../backend/src/services/matching.service.js'
import { analyzePendingIssues } from '../backend/src/services/aiAnalysis.service.js'
import '../backend/src/config/loadEnv.js'

/**
 * Stage 6 — collector pipeline runner.
 *
 * Every collector module (weather.js, osm.js, ...) provides a fetchFn that
 * returns raw source records; this runner does the bookkeeping and feeds the
 * Stage 3/4/5 pipeline:
 *
 *   1. ensure a data_sources row exists
 *   2. open a source_runs row (status: running)
 *   3. fetch raw records and store them verbatim in raw_records
 *   4. normalize (Stage 3) and insert canonical observations
 *   5. close the run (status: success + records_fetched)
 *   6. run geospatial matching (Stage 4) and AI analysis (Stage 5)
 *
 * Steps 1–5 are atomic in outcome: any failure marks the run 'failed' and
 * rethrows. Matching/AI failures are reported in the summary without
 * failing the ingestion run.
 */
export async function runCollector({
  sourceName,
  sourceType,
  url = null,
  fetchFn,
  batchSize = 500,
  runMatching = true,
  runAnalysis = true,
}) {
  if (!sourceName || !sourceType || typeof fetchFn !== 'function') {
    throw new Error('runCollector requires sourceName, sourceType, and fetchFn')
  }

  const backend = getBackendClient()
  if (!backend) {
    throw new Error('Supabase service client not configured (SUPABASE_SERVICE_ROLE_KEY)')
  }

  const source = await ensureSourceRow(backend, sourceName, sourceType, url)
  const run = await openRun(backend, source.id)

  const summary = {
    source: sourceName,
    run_id: run.id,
    records_fetched: 0,
    raw_records_stored: 0,
    observations_stored: 0,
    matching: null,
    analysis: null,
    errors: [],
  }

  try {
    const rawRecords = await fetchFn()
    summary.records_fetched = Array.isArray(rawRecords) ? rawRecords.length : 0

    if (summary.records_fetched > 0) {
      summary.raw_records_stored = await storeRawRecords(backend, run.id, sourceType, rawRecords, batchSize)
      summary.observations_stored = await storeObservations(backend, sourceType, rawRecords, batchSize)
    }

    await closeRun(backend, run.id, 'success', summary.records_fetched)
  } catch (err) {
    summary.errors.push(err.message)
    await closeRun(backend, run.id, 'failed', summary.records_fetched).catch(() => {})
    throw err
  }

  // Downstream pipeline stages (best effort — ingestion already succeeded)
  if (runMatching) {
    try {
      summary.matching = await matchUnlinkedObservations()
    } catch (err) {
      summary.errors.push(`matching failed: ${err.message}`)
    }
  }

  if (runAnalysis) {
    try {
      summary.analysis = await analyzePendingIssues(25)
    } catch (err) {
      summary.errors.push(`analysis failed: ${err.message}`)
    }
  }

  return summary
}

async function ensureSourceRow(backend, name, type, url) {
  const { data: existing, error } = await backend
    .from('data_sources')
    .select('id, name, type, url')
    .eq('name', name)
    .single()

  if (!error && existing) {
    return existing
  }

  const { data: created, error: insertError } = await backend
    .from('data_sources')
    .insert({ name, type, url })
    .select('id, name, type, url')
    .single()

  if (insertError || !created) {
    throw new Error(`Could not ensure data_sources row for ${name}: ${insertError?.message ?? 'no row'}`)
  }
  return created
}

async function openRun(backend, sourceId) {
  const { data, error } = await backend
    .from('source_runs')
    .insert({ source_id: sourceId, status: 'running' })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Could not open source_run: ${error?.message ?? 'no row'}`)
  }
  return data
}

async function closeRun(backend, runId, status, recordsFetched) {
  const { error } = await backend
    .from('source_runs')
    .update({ status, finished_at: new Date().toISOString(), records_fetched: recordsFetched })
    .eq('id', runId)

  if (error) {
    throw new Error(`Could not close source_run ${runId}: ${error.message}`)
  }
}

async function storeRawRecords(backend, runId, sourceType, rawRecords, batchSize) {
  let stored = 0
  for (let i = 0; i < rawRecords.length; i += batchSize) {
    const chunk = rawRecords.slice(i, i + batchSize).map((payload) => ({
      run_id: runId,
      source: sourceType,
      payload,
    }))

    const { error } = await backend.from('raw_records').insert(chunk)
    if (error) {
      throw new Error(`Could not store raw_records: ${error.message}`)
    }
    stored += chunk.length
  }
  return stored
}

async function storeObservations(backend, sourceType, rawRecords, batchSize) {
  const normalized = []
  const invalid = []

  rawRecords.forEach((raw) => {
    try {
      normalized.push(normalizeRecord(sourceType, raw))
    } catch (err) {
      invalid.push(err.message)
    }
  })

  for (let i = 0; i < normalized.length; i += batchSize) {
    const chunk = normalized.slice(i, i + batchSize)
    const { error } = await backend.from('observations').insert(chunk)
    if (error) {
      throw new Error(`Could not store observations: ${error.message}`)
    }
  }

  if (invalid.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[collector] ${invalid.length} record(s) failed normalization:`, invalid.slice(0, 5))
  }
  return normalized.length
}
