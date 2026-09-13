# CivicFlow — Database Schema (Stage 1)

PostgreSQL 15+ / PostGIS, designed for Supabase. Source of truth:
[`supabase/migrations/0001_initial_schema.sql`](../supabase/migrations/0001_initial_schema.sql).

## Entity relationships

```
auth.users ─1:1─ profiles ─┬─< observations (created_by)
                           ├─< verification_events (actor_id)
                           ├─< issue_history (actor_id)
                           └─< notifications (user_id)

observations >──issue_observations──< issues ─┬─< verification_events
 (source data)   (many-to-many)   │           ├─< issue_history
                                  │           ├─< notifications
                                  ├─>── departments
                                  └──< source_runs (via data_sources)

departments ──< issues (department_id)      data_sources ──< source_runs
road_segments (standalone, OSM geometry)
```

## Tables

| Table | Purpose | Key columns |
| --- | --- | --- |
| `profiles` | App profile, 1:1 with `auth.users`; auto-created on signup | `user_id` (unique FK → `auth.users`), `role` (`citizen`/`authority`/`admin`), `name`, `email` |
| `issues` | Deduplicated, actionable civic incidents | `category`, `lat`/`lng` + generated `geom`, `severity`, `confidence` (0–100), `status`, `department_id` |
| `observations` | Normalized records from every source (citizen, collectors, AI) | `source` + `source_record_id`, `created_by`, `category`, `lat`/`lng` + generated `geom`, `"timestamp"` (real-world time), `severity`, `confidence`, `evidence` (jsonb) |
| `issue_observations` | Many-to-many issue ↔ observation links | PK (`issue_id`, `observation_id`) |
| `verification_events` | Authority actions on an issue | `action` (`verified`/`rejected`/`merged`), `actor_id`, `notes` |
| `issue_history` | Append-only status audit trail | `status_change`, `actor_id` |
| `departments` | Municipal departments for assignment | `name` (unique), `contact` |
| `data_sources` | Ingestion source registry | `name`, `type` (`citizen_report`/`government`/`weather`/`osm`/`ai`/`other`), `reliability_score` (0–1) |
| `source_runs` | One row per collector/API run (Stage 6 writes here) | `source_id`, `started_at`/`finished_at`, `status` (`running`/`success`/`failed`), `records_fetched` |
| `notifications` | Per-user issue notifications | `user_id`, `issue_id`, `message`, `read` |
| `road_segments` | OSM-derived road condition data | `osm_id` (unique), `geometry` (PostGIS), `condition`, `last_maintenance` |

## Shared vocabularies (Postgres domains)

- `issue_category`: `ROAD_DAMAGE`, `WATER_LEAK`, `STREETLIGHT`, `GARBAGE`, `FLOODING`, `DRAINAGE`, `TRAFFIC_SIGNAL`, `DAMAGED_SIGN`, `OTHER`
- `severity_level`: `low` < `medium` < `high` < `critical`
- `issue_status`: `potential`, `verified`, `assigned`, `in_progress`, `resolved`, `rejected`, `merged`
- `source_type`: `citizen_report`, `government`, `weather`, `osm`, `ai`, `other`

## Automation (triggers)

| Trigger | Behaviour |
| --- | --- |
| `on_auth_user_created` | Auto-creates a `citizen` profile for each new `auth.users` row |
| `trg_touch_updated_at` | Maintains `updated_at` on `issues`, `observations`, `profiles`, `road_segments` |
| `trg_sync_new_issue` | A citizen-report observation (no `source_record_id`) instantly becomes a **`potential`** issue + link + history entry. Collector/AI observations do **not** create issues (Stage 4 clustering owns that) |
| `trg_sync_issue` | On link changes, recomputes issue `severity` (rank-ordered max) and `confidence` = max observation confidence + 5 per corroborating distinct source, capped at 95 |
| `trg_issues_history` | Appends `old.status -> new.status` to `issue_history` |
| `trg_stop_issue_status_edit` | Client roles (`anon`/`authenticated`) can never change `status`, `severity`, `confidence`, or `department_id` on issues |
| `trg_stop_profile_role_change` | Clients can never change their own `role` |

Nothing in the database ever auto-verifies — `potential` issues only become
`verified` through an authority action (Stage 2 API).

## Views

- `v_issue_scores` — priority scoring for the authority dashboard:
  `priority_score = severity weight (10–40) + min(20, 2 × observation_count) + recency bonus (20 → 0 over the first 20 hours)`, plus observation/source counts and recency.
- `v_issue_locations` — map payload: id, category, severity, status, lat/lng, department, counts, and a per-source breakdown for Stage 7 map layers.

Both views are `security_invoker` + `security_barrier`: the caller's RLS applies
inside them, and supporting SELECT grants on `observations`/`issue_observations`
are granted to `anon`/`authenticated` (row visibility is still RLS-filtered).

## Row Level Security matrix

The backend API uses `service_role`, which **bypasses RLS** (and the client
guards) — it must never be exposed to the frontend. All policies below apply
to browser sessions (`anon` = not logged in, `authenticated` = logged in).

| Table | anon | citizen | authority | admin |
| --- | --- | --- | --- | --- |
| `profiles` | — | read/update **own** (role locked) | read all + own update | read all + own update |
| `departments` | read | read | read | read + write |
| `data_sources` | read | read | read | read + write |
| `source_runs` | — | — | read | read + write |
| `observations` | — | read **own**; insert own citizen reports (source/created_by enforced by policy) | read all | read all |
| `issues` | read **active** only (`verified`/`assigned`/`in_progress`/`resolved`) | same as anon | read all | read all |
| `issue_observations` | —* | —* | read | read |
| `verification_events` | — | — | read + insert (own actor) | read + insert (own actor) |
| `issue_history` | — | — | read | read |
| `notifications` | — | read + write **own** | read + write **own** | read + write **own** |
| `road_segments` | — | — | read | read + write |

\* `issue_observations` has no client write path on purpose: linking is done by
the backend (clustering/merge logic, Stages 3–5).

**Citizens cannot modify authority-only fields.** They have no INSERT/UPDATE/
DELETE policies on `issues` at all, and a `BEFORE UPDATE` trigger additionally
blocks `status`/`severity`/`confidence`/`department_id` changes on any
client-role session (defense in depth for service-role code paths).

## Applying the schema

**Supabase (production):**

```bash
supabase db push          # applies supabase/migrations/*
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

or paste the migration into the Supabase SQL editor (needs the `postgres`
role because it creates a trigger on `auth.users`).

**Local verification (Docker, disposable):**

```bash
supabase/tests/run_local_docker.sh
# spins up postgis/postgis:16-3.4, applies a test-only auth shim +
# the migration + seed, runs supabase/tests/0001_smoke_test.sql
```

The smoke tests cover: table existence, seed data, citizen-report → potential
issue auto-creation, collector observations *not* creating issues, confidence
corroboration math + rank-ordered severity, `updated_at` touch, anon RLS
restrictions, and citizen insert rules via an emulated JWT. Everything runs in
a transaction that rolls back.
