# 2026 FIFA World Cup Tracker

A local web app to follow the 2026 FIFA World Cup in real time.

- **Backend**: Node.js + Express, polls `worldcup26.ir` every 10 s, caches data in memory
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

## Swapping the data source

The upstream URL is defined as a single constant at the top of `backend/server.js`:

```js
const SOURCE_BASE = 'https://worldcup26.ir';
```

The backend fetches three paths from that base:

```
GET <SOURCE_BASE>/get/games
GET <SOURCE_BASE>/get/groups
GET <SOURCE_BASE>/get/teams
GET <SOURCE_BASE>/get/stadiums
```

To swap the source, change `SOURCE_BASE` (and if the paths differ, update the four `fetchJson` calls in the `poll` function).

The frontend never talks to the upstream directly — all requests go through `/api/*` which the Vite dev server proxies to `http://localhost:3001`.

---

## Project structure

```
worldcup/
├── backend/
│   ├── package.json        # ESM, "type": "module"
│   └── server.js           # Express + polling + cache
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
