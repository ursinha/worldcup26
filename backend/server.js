import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { loadMatches, loadGroups, loadTeams, loadStadiums, savePrimary, saveEnrichment, saveGroups, saveTeams, saveStadiums } from './db.js';
import * as primary from './sources/primary.js';
import * as live from './sources/live.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dir, '../frontend/dist');

let COMMIT = 'unknown';
try { COMMIT = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch {}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const cache = {
  matches:     null,
  groups:      null,
  teams:       null,
  stadiums:    null,
  lastUpdated: null,
  lastError:   null,
};

function refreshCache() {
  const games    = loadMatches();
  const groups   = loadGroups();
  const teams    = loadTeams();
  const stadiums = loadStadiums();
  if (games.length)    cache.matches  = { games };
  if (groups.length)   cache.groups   = { groups };
  if (teams.length)    cache.teams    = { teams };
  if (stadiums.length) cache.stadiums = { stadiums };
}

refreshCache();
if (cache.matches) console.log(`[db] loaded ${cache.matches.games.length} matches`);

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

function hasLiveMatch() {
  return (cache.matches?.games ?? []).some(
    g => g.finished === 'FALSE' && g.time_elapsed !== 'notstarted',
  );
}

// Primary source
let primaryTimer = null;

async function pollPrimary() {
  try {
    const raw = await primary.fetchData();
    savePrimary(primary.extractUpdates(raw));
    refreshCache();
    cache.lastUpdated = new Date().toISOString();
    cache.lastError   = null;
  } catch (err) {
    cache.lastError = err.message;
    console.error(`[${primary.id}]`, err.message);
  }
  clearTimeout(primaryTimer);
  const interval = hasLiveMatch() ? primary.intervals.live : primary.intervals.idle;
  console.log(`[${primary.id}] next in ${interval / 1000}s`);
  primaryTimer = setTimeout(pollPrimary, interval);
}

// Live enrichment source
let liveTimer = null;

async function pollLive() {
  if (!hasLiveMatch()) return;
  try {
    const raw     = await live.fetchData();
    const updates = live.extractUpdates(raw, cache.matches?.games ?? []);
    if (updates.length) {
      saveEnrichment(updates);
      refreshCache();
    }
    console.log(`[${live.id}] synced ${updates.length} match(es)`);
  } catch (err) {
    console.error(`[${live.id}]`, err.message);
  }
  scheduleLive();
}

function scheduleLive() {
  clearTimeout(liveTimer);
  if (!hasLiveMatch()) return;
  liveTimer = setTimeout(pollLive, live.intervals.live);
}

// Static data — fetch once at startup, sourced from primary
try {
  const { groups, teams, stadiums } = await primary.fetchStatic();
  saveGroups(groups.groups ?? []);
  saveTeams(teams.teams ?? []);
  saveStadiums(stadiums.stadiums ?? []);
  cache.groups   = groups;
  cache.teams    = teams;
  cache.stadiums = stadiums;
  console.log('[init] static data loaded');
} catch (err) {
  console.error('[init]', err.message);
}

await pollPrimary();
pollLive(); // first live sync runs immediately if live, then schedules itself

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const serve = (key) => (_req, res) =>
  cache[key] ? res.json(cache[key]) : res.status(503).json({ error: 'No data yet' });

app.get('/api/matches',  serve('matches'));
app.get('/api/groups',   serve('groups'));
app.get('/api/teams',    serve('teams'));
app.get('/api/stadiums', serve('stadiums'));

app.get('/api/status', (_req, res) => res.json({
  ok:          cache.lastError === null,
  lastUpdated: cache.lastUpdated,
  lastError:   cache.lastError,
  live:        hasLiveMatch(),
  commit:      COMMIT,
}));

app.use(express.static(DIST, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));
app.get('*', (_req, res) => res.sendFile(join(DIST, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Server on http://0.0.0.0:${PORT}`));
