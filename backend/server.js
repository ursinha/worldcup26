import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import Database from 'better-sqlite3';

const __dir = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dir, '../frontend/dist');
const DATA_DIR = join(__dir, '../data');

let COMMIT = 'unknown';
try { COMMIT = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch {}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, 'worldcup.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS groups_tbl (
    name TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stadiums (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const _upsertMatch   = db.prepare('INSERT INTO matches (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
const _upsertGroup   = db.prepare('INSERT INTO groups_tbl (name, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
const _upsertTeam    = db.prepare('INSERT INTO teams (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
const _upsertStadium = db.prepare('INSERT INTO stadiums (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');

const saveMatches  = db.transaction((rows) => { const now = Date.now(); for (const r of rows) _upsertMatch.run(r.id, JSON.stringify(r), now); });
const saveGroups   = db.transaction((rows) => { const now = Date.now(); for (const r of rows) _upsertGroup.run(r.name, JSON.stringify(r), now); });
const saveTeams    = db.transaction((rows) => { const now = Date.now(); for (const r of rows) _upsertTeam.run(r.id, JSON.stringify(r), now); });
const saveStadiums = db.transaction((rows) => { const now = Date.now(); for (const r of rows) _upsertStadium.run(r.id, JSON.stringify(r), now); });

function loadMatches()  { return db.prepare('SELECT data FROM matches').all().map(r => JSON.parse(r.data)); }
function loadGroups()   { return db.prepare('SELECT data FROM groups_tbl').all().map(r => JSON.parse(r.data)); }
function loadTeams()    { return db.prepare('SELECT data FROM teams').all().map(r => JSON.parse(r.data)); }
function loadStadiums() { return db.prepare('SELECT data FROM stadiums').all().map(r => JSON.parse(r.data)); }

// ---------------------------------------------------------------------------
// In-memory cache (seeded from DB, kept fresh by polls)
// ---------------------------------------------------------------------------

const cache = {
  matches:     null,
  groups:      null,
  teams:       null,
  stadiums:    null,
  lastUpdated: null,
  lastError:   null,
};

{
  const games    = loadMatches();
  const groups   = loadGroups();
  const teams    = loadTeams();
  const stadiums = loadStadiums();
  if (games.length)    { cache.matches  = { games };    console.log(`[db] ${games.length} matches`); }
  if (groups.length)   { cache.groups   = { groups };   console.log(`[db] ${groups.length} groups`); }
  if (teams.length)    { cache.teams    = { teams };    console.log(`[db] ${teams.length} teams`); }
  if (stadiums.length) { cache.stadiums = { stadiums }; console.log(`[db] ${stadiums.length} stadiums`); }
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

const app = express();
const PORT = 3001;
const SOURCE_BASE = 'https://worldcup26.ir';

const INTERVAL_LIVE = 10_000;
const INTERVAL_IDLE = 2 * 60 * 60_000;

app.use(cors());
app.use(express.json());

function hasLiveMatch() {
  return (cache.matches?.games ?? []).some(
    (g) => g.finished === 'FALSE' && g.time_elapsed !== 'notstarted',
  );
}

async function fetchJson(path) {
  const res = await fetch(`${SOURCE_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

try {
  const [groups, teams, stadiums] = await Promise.all([
    fetchJson('/get/groups'),
    fetchJson('/get/teams'),
    fetchJson('/get/stadiums'),
  ]);
  saveGroups(groups.groups ?? []);
  saveTeams(teams.teams ?? []);
  saveStadiums(stadiums.stadiums ?? []);
  cache.groups   = groups;
  cache.teams    = teams;
  cache.stadiums = stadiums;
  console.log('[init] static data loaded and saved');
} catch (err) {
  console.error('[init error]', err.message);
}

let pollTimer = null;

async function poll() {
  try {
    const data = await fetchJson('/get/games');
    saveMatches(data.games ?? []);
    cache.matches    = data;
    cache.lastUpdated = new Date().toISOString();
    cache.lastError  = null;
  } catch (err) {
    cache.lastError = err.message;
    console.error('[poll error]', err.message);
  }
  scheduleNext();
}

function scheduleNext() {
  clearTimeout(pollTimer);
  const interval = hasLiveMatch() ? INTERVAL_LIVE : INTERVAL_IDLE;
  const label    = hasLiveMatch() ? '10 s (live)' : '2 h (idle)';
  console.log(`[poll] next in ${label}`);
  pollTimer = setTimeout(poll, interval);
}

await poll();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/api/matches',  (_req, res) => cache.matches  ? res.json(cache.matches)  : res.status(503).json({ error: 'No data yet' }));
app.get('/api/groups',   (_req, res) => cache.groups   ? res.json(cache.groups)   : res.status(503).json({ error: 'No data yet' }));
app.get('/api/teams',    (_req, res) => cache.teams    ? res.json(cache.teams)    : res.status(503).json({ error: 'No data yet' }));
app.get('/api/stadiums', (_req, res) => cache.stadiums ? res.json(cache.stadiums) : res.status(503).json({ error: 'No data yet' }));

app.get('/api/status', (_req, res) => {
  res.json({
    ok:          cache.lastError === null,
    lastUpdated: cache.lastUpdated,
    lastError:   cache.lastError,
    live:        hasLiveMatch(),
    commit:      COMMIT,
  });
});

app.use(express.static(DIST));
app.get('*', (_req, res) => res.sendFile(join(DIST, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
