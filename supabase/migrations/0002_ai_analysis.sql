-- ============================================================================
-- CivicFlow — Stage 5: AI analysis output on incidents
--
-- The AI service writes its structured analysis here. Columns are only
-- writable by the backend (service_role): no client update policies exist
-- on issues, and ai_analysis is excluded from every client-facing policy.
-- The AI NEVER changes `status` — potential issues stay potential until an
-- authority verifies them (enforced in the service layer and by tests).
-- ============================================================================

alter table public.issues
  add column if not exists ai_analysis jsonb,
  add column if not exists ai_analyzed_at timestamptz;

comment on column public.issues.ai_analysis is
  'Structured output from the Stage 5 AI service: {category, potential_cause, severity, confidence, recommended_department, reasoning, source: ai|heuristic, signals}';

comment on column public.issues.ai_analyzed_at is
  'When the AI analysis was last stored (service_role writes only).';
