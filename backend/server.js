import express from 'express';
import compression from 'compression';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { loadMatches, loadGroups, loadTeams, loadStadiums, savePrimary, saveEnrichment, saveGroups, saveTeams, saveStadiums, savePredictions, saveOdds, getMeta, setMeta } from './db.js';
import { computeAllPredictions } from './predictions.js';
import * as primary from './sources/primary.js';
import * as live from './sources/live.js';
import { toESPNDate } from './sources/live.js';
import * as oddsSource from './sources/odds.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dir, '../frontend/dist');

// ---------------------------------------------------------------------------
// Stadium timezone map (mirrors frontend utils/time.js)
// ---------------------------------------------------------------------------

const STADIUM_TZ = {
  '1':  'America/Mexico_City',
  '2':  'America/Mexico_City',
  '3':  'America/Mexico_City',
  '4':  'America/Chicago',
  '5':  'America/Chicago',
  '6':  'America/Chicago',
  '7':  'America/New_York',
  '8':  'America/New_York',
  '9':  'America/New_York',
  '10': 'America/New_York',
  '11': 'America/New_York',
  '12': 'America/Toronto',
  '13': 'America/Vancouver',
  '14': 'America/Los_Angeles',
  '15': 'America/Los_Angeles',
  '16': 'America/Los_Angeles',
};

function gameToUTC(localDateStr, stadiumId) {
  if (!localDateStr) return null;
  const tz = STADIUM_TZ[String(stadiumId)] ?? 'America/New_York';
  const [datePart, timePart] = localDateStr.split(' ');
  if (!datePart || !timePart) return null;
  const [mm, dd, yyyy] = datePart.split('/');
  const [hh, min] = timePart.split(':');
  const naive = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +min));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(naive);
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const apparent = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === '24' ? 0 : +p.hour, +p.minute));
  return new Date(naive.getTime() + (naive.getTime() - apparent.getTime()));
}

/**
 * Returns ms until 3 minutes before the next scheduled kickoff.
 * Returns 0 if a kickoff has already passed but hasn't been detected yet.
 * Returns Infinity if no upcoming matches exist.
 */
function msUntilNextKickoff() {
  const games = cache.matches?.games ?? [];
  const now = Date.now();
  let nearest = Infinity;
  for (const g of games) {
    if (g.finished !== 'FALSE' || g.time_elapsed !== 'notstarted') continue;
    const utc = gameToUTC(g.local_date, g.stadium_id);
    if (!utc) continue;
    const ms = utc.getTime() - now - 3 * 60_000; // wake 3 min before kickoff
    nearest = Math.min(nearest, Math.max(0, ms));
  }
  return nearest;
}

let COMMIT = process.env.COMMIT ?? 'unknown';
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
const PORT = process.env.PORT ?? 3001;

app.use(compression());
app.use(cors());
app.use(express.json());

function hasLiveMatch() {
  return (cache.matches?.games ?? []).some(
    g => g.finished === 'FALSE' && g.time_elapsed !== 'notstarted',
  );
}

// ---------------------------------------------------------------------------
// Source health state + call counters
// ---------------------------------------------------------------------------

const sourceState = {
  primary: { lastFetch: null, lastError: null, nextPoll: null },
  live:    { lastFetch: null, lastError: null, nextPoll: null, lastCount: null },
  odds:    { lastFetch: null, lastError: null, nextPoll: null, lastCount: null },
};

function utcDateStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
}

const callCounts     = { primary: null, live: null, odds: null };
const callTimestamps = { primary: [],   live: [],   odds: [] };
const WINDOW_24H     = 24 * 60 * 60 * 1000;

function loadCallCounts() {
  const today = utcDateStr();
  const cutoff = Date.now() - WINDOW_24H;
  for (const src of ['primary', 'live', 'odds']) {
    const savedDate  = getMeta(`calls_${src}_date`)  ?? today;
    const savedDaily = parseInt(getMeta(`calls_${src}_daily`) ?? '0', 10);
    const savedTotal = parseInt(getMeta(`calls_${src}_total`) ?? '0', 10);
    const isToday    = savedDate === today;
    callCounts[src]  = { daily: isToday ? savedDaily : 0, total: savedTotal, date: today };
    if (!isToday) {
      setMeta(`calls_${src}_daily`, 0);
      setMeta(`calls_${src}_date`, today);
    }
    const raw = getMeta(`calls_${src}_ts`);
    callTimestamps[src] = raw ? JSON.parse(raw).filter(t => t > cutoff) : [];
  }
}

function recordCall(src) {
  const now   = Date.now();
  const today = utcDateStr();
  const c     = callCounts[src];
  if (c.date !== today) { c.daily = 0; c.date = today; setMeta(`calls_${src}_date`, today); }
  c.daily++;
  c.total++;
  setMeta(`calls_${src}_daily`, c.daily);
  setMeta(`calls_${src}_total`, c.total);
  const ts = callTimestamps[src];
  ts.push(now);
  const cutoff = now - WINDOW_24H;
  while (ts.length && ts[0] <= cutoff) ts.shift();
  setMeta(`calls_${src}_ts`, JSON.stringify(ts));
}

loadCallCounts();

// Primary source
let primaryTimer = null;
let prevHadLive  = false;

async function pollPrimary() {
  recordCall('primary');
  try {
    const raw = await primary.fetchData();
    savePrimary(primary.extractUpdates(raw));
    refreshCache();

    const predRows = computeAllPredictions(cache.matches?.games ?? []);
    if (predRows.length) { savePredictions(predRows); refreshCache(); }

    cache.lastUpdated             = new Date().toISOString();
    cache.lastError               = null;
    sourceState.primary.lastFetch = cache.lastUpdated;
    sourceState.primary.lastError = null;
  } catch (err) {
    cache.lastError               = err.message;
    sourceState.primary.lastError = err.message;
    console.error(`[${primary.id}]`, err.message);
  }
  // Kick off live enrichment only on transition into live mode,
  // not on every poll (which would keep resetting the 8-min timer).
  const nowHasLive = hasLiveMatch();
  if (nowHasLive && !prevHadLive) scheduleLive();
  prevHadLive = nowHasLive;
  clearTimeout(primaryTimer);
  const interval = hasLiveMatch()
    ? primary.intervals.live
    : Math.max(60_000, Math.min(primary.intervals.idle, msUntilNextKickoff()));
  sourceState.primary.nextPoll = Date.now() + interval;
  console.log(`[${primary.id}] next in ${Math.round(interval / 1000)}s`);
  primaryTimer = setTimeout(pollPrimary, interval);
}

// Live enrichment source
let liveTimer = null;

async function pollLive() {
  if (!hasLiveMatch()) return;
  recordCall('live');
  try {
    const raw     = await live.fetchData();
    const updates = live.extractUpdates(raw, cache.matches?.games ?? []);
    if (updates.length) {
      saveEnrichment(updates);
      refreshCache();
    }
    sourceState.live.lastFetch = new Date().toISOString();
    sourceState.live.lastError = null;
    sourceState.live.lastCount = updates.length;
    console.log(`[${live.id}] synced ${updates.length} match(es)`);
  } catch (err) {
    sourceState.live.lastError = err.message;
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
  const interval = live.intervals.live;
  sourceState.live.nextPoll = Date.now() + interval;
  liveTimer = setTimeout(pollLive, interval);
}

// Odds source — O/U lines from The Odds API
let oddsTimer = null;

async function pollOdds() {
  recordCall('odds');
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
    sourceState.odds.lastFetch = new Date().toISOString();
    sourceState.odds.lastError = null;
    sourceState.odds.lastCount = updates.length;
  } catch (err) {
    sourceState.odds.lastError = err.message;
    console.error(`[${oddsSource.id}]`, err.message);
  }
  clearTimeout(oddsTimer);
  const interval = oddsSource.intervals.idle;
  sourceState.odds.nextPoll = Date.now() + interval;
  oddsTimer = setTimeout(pollOdds, interval);
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

app.get('/api/status', (_req, res) => {
  const games = cache.matches?.games ?? [];
  res.json({
    ok:          cache.lastError === null,
    lastUpdated: cache.lastUpdated,
    lastError:   cache.lastError,
    live:        hasLiveMatch(),
    commit:      COMMIT,
    sources: Object.fromEntries(
      Object.entries(sourceState).map(([k, v]) => [k, {
        ...v,
        calls: { ...callCounts[k], h24: callTimestamps[k].length },
      }])
    ),
    db: {
      matches:  games.length,
      enriched: games.filter(g => g.enriched_at != null).length,
      withOdds: games.filter(g => g.ou_line  != null).length,
    },
  });
});

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
