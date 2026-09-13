# CivicFlow

An AI-powered civic damage intelligence platform that combines citizen reports, public datasets, weather signals, and geospatial data to detect, verify, prioritize, and track civic infrastructure issues (potholes, water leaks, broken streetlights, garbage, flooding, etc.).

> **Status: end-to-end pipeline complete.** Schema + RLS, backend API, ingestion + dedup, geospatial matching, AI analysis, scheduled collectors, and the web dashboards are implemented. See [docs/schema.md](docs/schema.md) for the database reference.

## Tech Stack

| Layer      | Technology                                      |
| ---------- | ----------------------------------------------- |
| Frontend   | React + Vite, Tailwind CSS, React Router        |
| Backend    | Node.js + Express                               |
| DB & Auth  | Supabase (PostgreSQL)                           |
| Maps       | Leaflet / Mapbox (added later)                  |
| AI         | Placeholder service layer (added later)         |
| Deployment | Vercel (frontend) · Render / Railway (backend)  |

## Folder Structure

```
CivicFlow/
├── frontend/        # React + Vite app (landing, map, report, authority, admin)
│   └── src/
│       ├── components/
│       └── pages/
├── supabase/        # Postgres schema, seed data, and SQL tests
│   ├── migrations/  # 0001 schema + RLS · 0002 AI columns · 0003 raw_records
│   ├── seed.sql     # starter departments + data sources
│   └── tests/       # smoke tests + local Docker runner
├── backend/         # Express API (auth, reports, issues, analytics, admin)
│   ├── config/      # Env loading + Supabase client factory (anon/service/user)
│   ├── controllers/ # Request validation + response shaping
│   ├── ingestion/   # Observation schema, category map, normalizers, dedup
│   ├── matching/    # Incident grouping + confidence scoring
│   ├── middleware/  # Supabase JWT auth with citizen/authority/admin roles
│   ├── routes/
│   ├── services/    # report, issue, analytics, matching, AI analysis
│   ├── test/        # 77 unit/API tests (node:test, fake Supabase client)
│   ├── app.js
│   └── server.js
├── collectors/      # Stage 6: weather + OSM collectors, runner, cron scheduler
├── frontend/        # React + Vite: dashboards, report form, Leaflet map
├── docs/            # Project documentation
├── .env.example     # Environment variable template
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 20+ (22 or 24 recommended)
- npm 10+

### 1. Clone and install

```bash
git clone https://github.com/Rohit323811/CivicFlow.git
cd CivicFlow

cd backend
npm install
```

```bash
cd frontend
npm install
```

### 2. Environment variables

Copy the template to `.env` at the repo root and fill in values as they become relevant:

```bash
cp .env.example .env
```

| Variable                                                        | Used for                                |
| --------------------------------------------------------------- | --------------------------------------- |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase client (placeholder for now) |
| `PORT`                                                          | Backend port (default `5000`)           |
| `AI_API_KEY`                                                    | Future AI service integration           |
| `WEATHER_API_KEY`                                               | Future weather signal integration       |

### 3. Apply the database schema

Paste `supabase/migrations/0001_initial_schema.sql`, `0002_ai_analysis.sql`, and
`0003_raw_records.sql` into the Supabase SQL editor (or run `supabase db push`),
then run `supabase/seed.sql`. Verify locally with `supabase/tests/run_local_docker.sh`
(needs Docker). See [docs/schema.md](docs/schema.md).

### 4. Run the backend

```bash
cd backend
npm install
npm run dev
# API live at http://localhost:5000 — try GET /api/health
```

Endpoints: `POST /api/reports` · `GET /api/reports/mine` · `GET /api/issues`
(with category/severity/status/bounds filters) · `GET /api/issues/:id` ·
`POST /api/issues/:id/verify|assign|status` (authority) ·
`GET /api/analytics/summary` (authority) · `GET /api/departments` ·
`GET /api/admin/users|data-sources` (admin). Auth uses Supabase JWTs with a
citizen < authority < admin role hierarchy.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
# App live at http://localhost:5173
```

Frontend routes: `/` (landing) · `/map` (live Leaflet map with filters) ·
`/report` (citizen report form) · `/my-reports` · `/authority` (triage
dashboard) · `/admin` (console). Set `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL` in `frontend/.env.local`.

### 6. Run the collectors (optional)

```bash
node collectors/osm.js        # one OpenStreetMap run
node collectors/weather.js    # needs WEATHER_API_KEY + WEATHER_LAT/LNG
node collectors/scheduler.js  # cron loop (schedules in .env)
```

Each run logs to `source_runs`, stores raw payloads in `raw_records`, then
feeds dedup → geospatial matching → AI analysis.

### Tests

```bash
cd backend && npm test   # 77 tests: API, ingestion, matching, AI, collectors
```

## Implementation status

- **Stage 1 — Database schema + RLS:** 11 tables, PostGIS, lifecycle triggers, role-based policies ([docs/schema.md](docs/schema.md))
- **Stage 2 — Backend API:** Supabase JWT auth, RBAC, reports/issues/analytics endpoints, status-transition guard
- **Stage 3 — Ingestion + normalization:** common Observation schema, category map, weather/OSM normalizers, dedup clustering
- **Stage 4 — Geospatial matching:** incident grouping (category + 100 m + 7 d), multi-source confidence scoring capped at 95
- **Stage 5 — AI analysis:** OpenAI-compatible provider + deterministic heuristic fallback; output stored on issues, never auto-verifies
- **Stage 6 — Collectors:** weather + OpenStreetMap with source-run bookkeeping, raw-record audit trail, node-cron scheduler
- **Stage 7 — Frontend:** citizen report flow, my reports, Leaflet map with layers/filters, authority triage, admin console

Next up: photo/media uploads, deployment configs (Vercel + Render/Railway),
notification fan-out, and production AI tuning.
