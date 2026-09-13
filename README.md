# CivicFlow

An AI-powered civic damage intelligence platform that combines citizen reports, public datasets, weather signals, and geospatial data to detect, verify, prioritize, and track civic infrastructure issues (potholes, water leaks, broken streetlights, garbage, flooding, etc.).

> **Status: project scaffold only.** This is the starting skeleton — features are coming in future commits.

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
├── backend/         # Express API
│   ├── config/      # Env loading + Supabase client placeholder
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── app.js
│   └── server.js
├── collectors/      # (empty) future public-data / weather collectors
├── docs/            # (empty) future project documentation
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

### 3. Run the backend

```bash
cd backend
npm run dev
# API live at http://localhost:5000 — try GET /api/health
```

### 4. Run the frontend

```bash
cd frontend
npm run dev
# App live at http://localhost:5173
```

Frontend routes: `/` (landing) · `/map` · `/report` · `/authority` · `/admin`

## Roadmap

Coming in future commits (not implemented yet):

- Supabase schema, auth, and row-level security
- Citizen report flow and media uploads
- Map integration (Leaflet/Mapbox) with clustered issue markers
- Data collectors (public datasets, weather signals)
- AI detection / verification / prioritization services
- Authority triage dashboard and admin console
- Deployment configs for Vercel and Render/Railway
