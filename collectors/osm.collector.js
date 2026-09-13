import { getSupabase } from '../backend/src/config/supabase.js'
import { normalizeObservation } from '../backend/src/services/normalization.service.js'

/**
 * Collector module for OpenStreetMap road infrastructure defect signals.
 */
export async function runOsmCollector() {
  const startedAt = new Date().toISOString()
  const supabase = getSupabase()
  let sourceRunId = null

  if (supabase) {
    const { data: source } = await supabase
      .from('data_sources')
      .select('id')
      .eq('name', 'OpenStreetMap')
      .single()

    const { data: run } = await supabase
      .from('source_runs')
      .insert({
        source_id: source?.id || null,
        started_at: startedAt,
        status: 'running',
      })
      .select()
      .single()

    sourceRunId = run?.id
  }

  try {
    // Simulated OSM highway surface defect ingestion
    const rawOsmRecords = [
      {
        osm_id: `osm-node-${Date.now()}-1`,
        type: 'pothole',
        details: 'OSM node tagged surface=unpaved defect=pothole',
        lat: 37.7752,
        lon: -122.4185,
        severity: 'moderate',
        timestamp: new Date().toISOString(),
      },
    ]

    const normalized = rawOsmRecords.map((rec) => normalizeObservation(rec, 'osm'))

    if (supabase && normalized.length > 0) {
      await supabase.from('observations').insert(normalized)
    }

    if (supabase && sourceRunId) {
      await supabase
        .from('source_runs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          records_fetched: normalized.length,
        })
        .eq('id', sourceRunId)
    }

    return {
      status: 'completed',
      records_fetched: normalized.length,
      records: normalized,
    }
  } catch (err) {
    if (supabase && sourceRunId) {
      await supabase
        .from('source_runs')
        .update({
          status: 'failed',
          finished_at: new Date().toISOString(),
        })
        .eq('id', sourceRunId)
    }
    throw err
  }
}
