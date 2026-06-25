const SOURCE_BASE = 'https://worldcup26.ir';

export const id = 'primary';
export const intervals = { live: 10_000, idle: 2 * 60 * 60_000 };

export async function fetchData() {
  const res = await fetch(`${SOURCE_BASE}/get/games`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchGroups() {
  const res = await fetch(`${SOURCE_BASE}/get/groups`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchStatic() {
  const [groups, teams, stadiums] = await Promise.all([
    fetch(`${SOURCE_BASE}/get/groups`).then(r => r.json()),
    fetch(`${SOURCE_BASE}/get/teams`).then(r => r.json()),
    fetch(`${SOURCE_BASE}/get/stadiums`).then(r => r.json()),
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
    primary_updated_at: now,
  }));
}
