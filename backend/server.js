import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;
const SOURCE_BASE = 'https://worldcup26.ir';
const POLL_INTERVAL = 10_000;

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

async function fetchJson(path) {
  const res = await fetch(`${SOURCE_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

async function poll() {
  try {
    const [matches, groups, teams, stadiums] = await Promise.all([
      fetchJson('/get/games'),
      fetchJson('/get/groups'),
      fetchJson('/get/teams'),
      fetchJson('/get/stadiums'),
    ]);
    cache.matches = matches;
    cache.groups = groups;
    cache.teams = teams;
    cache.stadiums = stadiums;
    cache.lastUpdated = new Date().toISOString();
    cache.lastError = null;
  } catch (err) {
    cache.lastError = err.message;
    console.error('[poll error]', err.message);
  }
}

// Initial poll then schedule
await poll();
setInterval(poll, POLL_INTERVAL);

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
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
