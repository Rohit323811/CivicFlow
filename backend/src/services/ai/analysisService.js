import { env } from '../../config/env.js'
import { scoreIncident } from '../../matching/scoring.js'
import {
  modeCategory,
  maxSeverity,
  recommendedDepartmentFor,
  potentialCauseFor,
  buildReasoning,
} from './heuristics.js'

/**
 * Stage 5 — AI analysis of an incident (cluster of observations).
 *
 * Contract: returns
 *   { category, potential_cause, severity, confidence,
 *     recommended_department, reasoning, source: 'ai' | 'heuristic', signals }
 *
 * Rules:
 *  - confidence is ALWAYS capped at 95 and the output never includes a
 *    status — the caller (aiAnalysis.service) stores it verbatim on the
 *    issue without touching status. AI only ever informs 'potential' issues.
 *  - When AI_API_KEY is absent, or the provider call fails or returns
 *    malformed JSON, the deterministic heuristic path is used instead.
 */

const VALID_CATEGORIES = new Set([
  'ROAD_DAMAGE', 'WATER_LEAK', 'STREETLIGHT', 'GARBAGE',
  'FLOODING', 'DRAINAGE', 'TRAFFIC_SIGNAL', 'DAMAGED_SIGN', 'OTHER',
])
const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical'])

export function isAiConfigured() {
  const { aiApiKey, aiBaseUrl } = env.liveAiConfig
  return Boolean(aiApiKey && aiBaseUrl)
}

export async function analyzeIncident(observations) {
  const signals = scoreIncident({ members: observations }).signals
  const { aiApiKey, aiBaseUrl } = env.liveAiConfig

  if (aiApiKey && aiBaseUrl) {
    try {
      const result = await callProvider(observations, signals, { aiApiKey, aiBaseUrl, aiModel: env.liveAiConfig.aiModel })
      return normalizeAnalysis(result, observations, signals, 'ai')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[ai] provider call failed, falling back to heuristics: ${err.message}`)
    }
  }

  return heuristicAnalysis(observations, signals)
}

export function heuristicAnalysis(observations, signals = scoreIncident({ members: observations }).signals) {
  const category = modeCategory(observations)
  let severity = maxSeverity(observations)

  // Crowd corroboration: 3+ agreeing observations bump severity one step.
  if (observations.length >= 3) {
    severity = { low: 'medium', medium: 'high', high: 'critical', critical: 'critical' }[severity]
  }

  return {
    category,
    potential_cause: potentialCauseFor(category, observations),
    severity,
    confidence: scoreConfidenceFromSignals(observations, signals),
    recommended_department: recommendedDepartmentFor(category),
    reasoning: buildReasoning(observations, signals),
    source: 'heuristic',
    signals,
  }
}

function scoreConfidenceFromSignals(observations, signals) {
  const maxMember = Math.max(...observations.map((o) => Number(o.confidence) || 0), 0)
  const corroboration = signals.distinct_sources >= 3 ? 90 : signals.distinct_sources === 2 ? 75 : 50
  const value = 0.5 * maxMember + 0.3 * corroboration + 0.1 * (signals.agreement ?? 0) + 0.1 * (signals.recency ?? 0)
  return Math.min(95, Math.round(value * 100) / 100)
}

// ---------------------------------------------------------------------------
// Provider call (OpenAI-compatible chat completions API by default)
// ---------------------------------------------------------------------------
async function callProvider(observations, signals, { aiApiKey, aiBaseUrl, aiModel }) {
  const model = aiModel ?? 'gpt-4o-mini'
  const url = `${(aiBaseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`

  const payload = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You analyze clusters of civic-issue observations. Respond with STRICT JSON only: ' +
          '{"category": one of ROAD_DAMAGE|WATER_LEAK|STREETLIGHT|GARBAGE|FLOODING|DRAINAGE|TRAFFIC_SIGNAL|DAMAGED_SIGN|OTHER, ' +
          '"potential_cause": short string, "severity": one of low|medium|high|critical, ' +
          '"confidence": number 0-95, "recommended_department": short string or null, "reasoning": short string}. ' +
          'Base severity and confidence on the evidence; never inflate. Do NOT include any status field.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          observations: observations.slice(0, 25).map((o) => ({
            source: o.source,
            category: o.category,
            description: o.description,
            severity: o.severity,
            confidence: o.confidence,
            timestamp: o.timestamp,
          })),
          signals,
        }),
      },
    ],
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${aiApiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    throw new Error(`provider responded ${response.status}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('provider returned no content')
  }
  return JSON.parse(content)
}

/** Validate + coerce a provider response into the analysis contract. */
export function normalizeAnalysis(raw, observations, signals, sourceLabel) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('analysis payload must be an object')
  }

  const category = VALID_CATEGORIES.has(raw.category) ? raw.category : modeCategory(observations)
  const severity = VALID_SEVERITIES.has(raw.severity) ? raw.severity : maxSeverity(observations)
  const confidence = Math.min(95, Math.max(0, Number(raw.confidence) || 0))

  return {
    category,
    potential_cause: String(raw.potential_cause ?? 'Insufficient evidence to determine a cause').slice(0, 500),
    severity,
    confidence,
    recommended_department: raw.recommended_department ? String(raw.recommended_department).slice(0, 200) : null,
    reasoning: String(raw.reasoning ?? '').slice(0, 2000),
    source: sourceLabel,
    signals,
  }
}
