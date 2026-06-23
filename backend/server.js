import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dir, '../frontend/dist');

const app = express();
const PORT = 3001;
const SOURCE_BASE = 'https://worldcup26.ir';

// Adaptive poll intervals
const INTERVAL_LIVE = 10_000;           // 10 s — a match is in progress
const INTERVAL_IDLE = 2 * 60 * 60_000; // 2 h  — no live matches

app.use(cors());
app.use(express.json());

const cache = {
  matches: null,
  groups: null,
  teams: null,
  stadiums: null,
  lastUpdated: null,
  lastError: null,
};

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

// Fetch static data once at startup
try {
  const [groups, teams, stadiums] = await Promise.all([
    fetchJson('/get/groups'),
    fetchJson('/get/teams'),
    fetchJson('/get/stadiums'),
  ]);
  cache.groups = groups;
  cache.teams = teams;
  cache.stadiums = stadiums;
  console.log('[init] static data loaded');
} catch (err) {
  console.error('[init error]', err.message);
}

let pollTimer = null;

async function poll() {
  try {
    cache.matches = await fetchJson('/get/games');
    cache.lastUpdated = new Date().toISOString();
    cache.lastError = null;
  } catch (err) {
    cache.lastError = err.message;
    console.error('[poll error]', err.message);
  }

  scheduleNext();
}

function scheduleNext() {
  clearTimeout(pollTimer);
  const interval = hasLiveMatch() ? INTERVAL_LIVE : INTERVAL_IDLE;
  const label = hasLiveMatch() ? '10 s (live)' : '2 h (idle)';
  console.log(`[poll] next in ${label}`);
  pollTimer = setTimeout(poll, interval);
}

// Initial matches poll, then adaptive schedule
await poll();

app.get('/api/matches', (_req, res) => {
  if (cache.matches === null) return res.status(503).json({ error: 'No data yet' });
  res.json(cache.matches);
});

app.get('/api/groups', (_req, res) => {
  if (cache.groups === null) return res.status(503).json({ error: 'No data yet' });
  res.json(cache.groups);
});

app.get('/api/teams', (_req, res) => {
  if (cache.teams === null) return res.status(503).json({ error: 'No data yet' });
  res.json(cache.teams);
});

app.get('/api/stadiums', (_req, res) => {
  if (cache.stadiums === null) return res.status(503).json({ error: 'No data yet' });
  res.json(cache.stadiums);
});

app.get('/api/status', (_req, res) => {
  res.json({
    ok: cache.lastError === null,
    lastUpdated: cache.lastUpdated,
    lastError: cache.lastError,
    live: hasLiveMatch(),
  });
});

// Serve built frontend in production
app.use(express.static(DIST));
app.get('*', (_req, res) => res.sendFile(join(DIST, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
