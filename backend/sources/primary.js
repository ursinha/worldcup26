const SOURCE_BASE = 'https://worldcup26.ir';

export const id = 'primary';
export const intervals = { live: 10_000, idle: 2 * 60 * 60_000 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Retry transient server errors, but NOT 429 (rate limit) — backing off to the
// next scheduled poll is the right move there.
const RETRY_STATUS = new Set([500, 502, 503, 504]);

/**
 * Fetch JSON with a couple of quick retries so a single transient blip
 * (the occasional "fetch failed" network hiccup, or a 5xx) doesn't surface as
 * a source error. Backoff is short: 400ms, then 800ms.
 */
async function fetchJson(url, { retries = 2, baseDelay = 400 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(baseDelay * attempt);
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      lastErr = new Error(`HTTP ${res.status}`);
      if (!RETRY_STATUS.has(res.status)) break; // non-transient: stop retrying
    } catch (err) {
      lastErr = err; // network error (e.g. "fetch failed") — retry
    }
  }
  throw lastErr;
}

export async function fetchData() {
  return fetchJson(`${SOURCE_BASE}/get/games`);
}

export async function fetchGroups() {
  return fetchJson(`${SOURCE_BASE}/get/groups`);
}

export async function fetchStatic() {
  const [groups, teams, stadiums] = await Promise.all([
    fetchJson(`${SOURCE_BASE}/get/groups`),
    fetchJson(`${SOURCE_BASE}/get/teams`),
    fetchJson(`${SOURCE_BASE}/get/stadiums`),
  ]);
  return { groups, teams, stadiums };
}

export function extractUpdates(rawData) {
  const now = Date.now();
  return (rawData.games ?? []).map(g => ({
    id:                g.id,
    home_team_id:      g.home_team_id      ?? null,
    away_team_id:      g.away_team_id      ?? null,
    home_team_name_en: g.home_team_name_en ?? null,
    away_team_name_en: g.away_team_name_en ?? null,
    home_team_label:   g.home_team_label   ?? null,
    away_team_label:   g.away_team_label   ?? null,
    home_score:        g.home_score        ?? null,
    away_score:        g.away_score        ?? null,
    home_scorers:      g.home_scorers      ?? null,
    away_scorers:      g.away_scorers      ?? null,
    group_name:        g.group             ?? null,
    matchday:          g.matchday          ?? null,
    local_date:        g.local_date        ?? null,
    stadium_id:        g.stadium_id        ?? null,
    finished:          g.finished          ?? null,
    time_elapsed:      g.time_elapsed      ?? null,
    type:              g.type              ?? null,
    home_penalty:      g.home_penalty      ?? null,
    away_penalty:      g.away_penalty      ?? null,
    primary_updated_at: now,
  }));
}
