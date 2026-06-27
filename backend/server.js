import express from 'express';
import compression from 'compression';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { loadMatches, loadGroups, loadTeams, loadStadiums, savePrimary, saveEnrichment, saveGroups, saveTeams, saveStadiums, savePredictions, saveOdds, saveResolved, getMeta, setMeta } from './db.js';
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
    const [raw, groupsData] = await Promise.all([
      primary.fetchData(),
      primary.fetchGroups(),
    ]);
    savePrimary(primary.extractUpdates(raw));
    saveGroups(groupsData.groups ?? []);
    refreshCache();

    // Resolve knockout team names from standings/labels
    const resolvedRows = buildResolvedRows(
      cache.matches?.games ?? [],
      cache.groups?.groups ?? [],
      cache.teams?.teams ?? [],
    );
    if (resolvedRows.length) {
      saveResolved(resolvedRows);
      refreshCache();
      console.log(`[${primary.id}] resolved ${resolvedRows.length} knockout slot(s)`);
    }

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
  if (!hasLiveMatch()) {
    sourceState.live.nextPoll = null;
    sourceState.live.lastFetch = null;
    sourceState.live.lastCount = null;
    return;
  }
  const interval = live.intervals.live;
  sourceState.live.nextPoll = Date.now() + interval;
  liveTimer = setTimeout(pollLive, interval);
}

// ---------------------------------------------------------------------------
// Resolve knockout team names from group standings + bracket labels
// ---------------------------------------------------------------------------

function sortGroupTeams(teams) {
  return [...teams].sort((a, b) => {
    if (+b.pts !== +a.pts) return +b.pts - +a.pts;
    if (+b.gd  !== +a.gd)  return +b.gd  - +a.gd;
    return +b.gf - +a.gf;
  });
}

/**
 * Resolve a team slot from its label + group standings.
 * Returns { id, name } or null.
 */
function resolveSlot(teamId, label, gameMap, groupMap, teamMap, depth = 0) {
  if (depth > 5) return null;
  if (teamId && teamId !== '0') {
    const t = teamMap[teamId];
    return t ? { id: teamId, name: t.name_en } : null;
  }
  if (!label) return null;

  const wg = label.match(/^Winner Group ([A-L])$/);
  if (wg) {
    const group = groupMap[wg[1]];
    if (!group) return null;
    const sorted = sortGroupTeams(group.teams);
    const t = teamMap[sorted[0]?.team_id];
    return t ? { id: sorted[0].team_id, name: t.name_en } : null;
  }

  const rug = label.match(/^Runner-up Group ([A-L])$/);
  if (rug) {
    const group = groupMap[rug[1]];
    if (!group) return null;
    const sorted = sortGroupTeams(group.teams);
    const t = teamMap[sorted[1]?.team_id];
    return t ? { id: sorted[1].team_id, name: t.name_en } : null;
  }

  const wm = label.match(/^Winner Match (\d+)$/);
  if (wm) {
    const game = gameMap[wm[1]];
    if (!game || game.finished !== 'TRUE') return null;
    let winnerId;
    if (+game.home_score !== +game.away_score) {
      winnerId = +game.home_score > +game.away_score ? game.home_team_id : game.away_team_id;
    } else {
      winnerId = +game.home_penalty > +game.away_penalty ? game.home_team_id : game.away_team_id;
    }
    const t = teamMap[winnerId];
    return t ? { id: winnerId, name: t.name_en } : null;
  }

  const lm = label.match(/^Loser Match (\d+)$/);
  if (lm) {
    const game = gameMap[lm[1]];
    if (!game || game.finished !== 'TRUE') return null;
    let loserId;
    if (+game.home_score !== +game.away_score) {
      loserId = +game.home_score < +game.away_score ? game.home_team_id : game.away_team_id;
    } else {
      loserId = +game.home_penalty < +game.away_penalty ? game.home_team_id : game.away_team_id;
    }
    const t = teamMap[loserId];
    return t ? { id: loserId, name: t.name_en } : null;
  }

  return null; // 3rd-place group slots — too complex for now
}

/**
 * Find knockout matches missing team names and resolve them from labels +
 * current standings. Returns rows ready for saveResolved().
 */
function buildResolvedRows(games, groups, teams) {
  if (!groups?.length || !teams?.length) return [];

  const teamMap  = Object.fromEntries(teams.map(t => [String(t.id), t]));
  const groupMap = Object.fromEntries(groups.map(g => [g.name, g]));
  const gameMap  = Object.fromEntries(games.map(g => [String(g.id), g]));
  const rows = [];

  for (const g of games) {
    if (g.type === 'group') continue;
    if (g.home_team_name_en && g.away_team_name_en) continue; // already set

    const home = !g.home_team_name_en
      ? resolveSlot(g.home_team_id, g.home_team_label, gameMap, groupMap, teamMap)
      : null;
    const away = !g.away_team_name_en
      ? resolveSlot(g.away_team_id, g.away_team_label, gameMap, groupMap, teamMap)
      : null;

    if (!home && !away) continue; // nothing new to resolve

    rows.push({
      id:                g.id,
      home_team_id:      home?.id   ?? null,
      away_team_id:      away?.id   ?? null,
      home_team_name_en: home?.name ?? null,
      away_team_name_en: away?.name ?? null,
      projected:         1,
    });
  }

  return rows;
}

// Odds source — optional. It only calibrates predictions, which fall back to
// the pure model without it. Disabled by default; to (re)enable, set
// ODDS_ENABLED=true and provide a valid key for the provider in sources/odds.js.
// Swapping providers later = replace sources/odds.js (same id/fetch/extract
// interface) — nothing else here changes.
const ODDS_ENABLED = process.env.ODDS_ENABLED === 'true';
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
if (ODDS_ENABLED) {
  pollOdds();
} else {
  sourceState.odds.disabled = true;
  console.log(`[${oddsSource.id}] disabled (set ODDS_ENABLED=true to enable)`);
}

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
