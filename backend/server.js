import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { loadMatches, loadGroups, loadTeams, loadStadiums, savePrimary, saveEnrichment, saveGroups, saveTeams, saveStadiums, savePredictions, saveOdds } from './db.js';
import { computeAllPredictions } from './predictions.js';
import * as primary from './sources/primary.js';
import * as live from './sources/live.js';
import { toESPNDate } from './sources/live.js';
import * as oddsSource from './sources/odds.js';

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

    const predRows = computeAllPredictions(cache.matches?.games ?? []);
    if (predRows.length) { savePredictions(predRows); refreshCache(); }

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

// One-time backfill: fetch events for all finished matches that have none yet
async function backfillEvents() {
  const games   = cache.matches?.games ?? [];
  const pending = games.filter(g => g.finished === 'TRUE' && !g.events);
  if (!pending.length) return;

  const dates = [...new Set(pending.map(g => toESPNDate(g.local_date)))].filter(Boolean);
  console.log(`[${live.id}] backfilling ${pending.length} matches over ${dates.length} date(s)`);

  for (const date of dates) {
    try {
      const raw     = await live.fetchData(date);
      const updates = live.extractUpdates(raw, games);
      if (updates.length) {
        saveEnrichment(updates);
        refreshCache();
      }
      console.log(`[${live.id}] backfilled ${updates.length} match(es) for ${date}`);
    } catch (err) {
      console.error(`[${live.id}] backfill error for ${date}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 300)); // be polite between requests
  }
}

function scheduleLive() {
  clearTimeout(liveTimer);
  if (!hasLiveMatch()) return;
  liveTimer = setTimeout(pollLive, live.intervals.live);
}

// Odds source — O/U lines from The Odds API
let oddsTimer = null;

async function pollOdds() {
  try {
    const raw     = await oddsSource.fetchOdds();
    const updates = oddsSource.extractOdds(raw, cache.matches?.games ?? []);
    if (updates.length) {
      saveOdds(updates);
      refreshCache();
      // Recompute predictions with the new O/U lines
      const predRows = computeAllPredictions(cache.matches?.games ?? []);
      if (predRows.length) { savePredictions(predRows); refreshCache(); }
      console.log(`[${oddsSource.id}] updated ${updates.length} O/U line(s)`);
    } else {
      console.log(`[${oddsSource.id}] no matches found in odds feed`);
    }
  } catch (err) {
    console.error(`[${oddsSource.id}]`, err.message);
  }
  clearTimeout(oddsTimer);
  oddsTimer = setTimeout(pollOdds, oddsSource.intervals.idle);
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
pollLive();
backfillEvents();
pollOdds();

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

const server = app.listen(PORT, '0.0.0.0', () => console.log(`Server on http://0.0.0.0:${PORT}`));

// Graceful shutdown so pm2 reload releases the port before the new process starts
function shutdown() {
  clearTimeout(primaryTimer);
  clearTimeout(liveTimer);
  clearTimeout(oddsTimer);
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
