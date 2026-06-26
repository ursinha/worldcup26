# 2026 FIFA World Cup Tracker

A local web app to follow the 2026 FIFA World Cup in real time.

- **Backend**: Node.js + Express, polls external sources on an adaptive schedule, persists data in SQLite
- **Frontend**: Vite + React, polls the backend every 15 s, all times shown in Brasília time (BRT)

---

## Running the project

You need two terminal sessions.

### Terminal 1 — Backend

```bash
cd backend
npm install
npm run dev
# Listening on http://localhost:3001
```

### Terminal 2 — Frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

---

## API endpoints (backend)

| Endpoint | Description |
|---|---|
| `GET /api/matches` | All games (`{ games: [...] }`) |
| `GET /api/groups` | Group standings (`{ groups: [...] }`) |
| `GET /api/teams` | Team metadata + flags (`{ teams: [...] }`) |
| `GET /api/stadiums` | Stadium info + timezone region (`{ stadiums: [...] }`) |
| `GET /api/status` | Health check: `{ ok, lastUpdated, lastError }` |

---

## Polling and rate limiting

The backend uses an adaptive polling schedule: **every 10 seconds while a match is live**, **every 2 hours when idle**. Static data (groups, teams, stadiums) is fetched once at startup. A secondary source (ESPN) syncs live match enrichment data (clock, card/goal events) **every 30 seconds during live matches**, and is idle otherwise.

**Please be mindful of upstream services.** Do not reduce the polling intervals below what is configured or run multiple instances pointing at the same sources.

---

## Data sources

Sources are defined as modules under `backend/sources/`. Each exports `id`, `intervals`, `fetchData()`, and `extractUpdates()`. The server runs each source on its own timer and merges results into a shared SQLite schema — the match object is the canonical representation, built from all contributors.

To add or swap a source, add a new file under `backend/sources/` following the same interface.

---

## Project structure

```
worldcup/
├── backend/
│   ├── db.js               # SQLite schema, upserts, reads
│   ├── sources/
│   │   ├── primary.js      # Base match data
│   │   └── live.js         # Live clock + match events
│   ├── package.json        # ESM, "type": "module"
│   └── server.js           # Express + polling orchestration
└── frontend/
    ├── vite.config.js      # Proxy /api → :3001
    └── src/
        ├── hooks/
        │   └── usePolling.js        # Generic polling hook (15 s default)
        ├── utils/
        │   ├── time.js              # BRT conversion via Intl (no library)
        │   └── parsers.js           # Scorer strings, status, stage labels
        └── components/
            ├── StatusBar.jsx        # Sticky health / last-update bar
            ├── MatchesTab/
            │   ├── MatchesTab.jsx   # Filter + date grouping
            │   └── MatchCard.jsx    # Individual match card
            └── GroupsTab/
                ├── GroupsTab.jsx    # Grid layout
                └── GroupTable.jsx  # Standings table
```
# 2026 FIFA World Cup tracker
