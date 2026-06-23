import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, '../data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, 'worldcup.db'));

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

// Drop old blob-based matches table if present (one-time migration)
const oldCols = db.pragma('table_info(matches)').map(c => c.name);
if (oldCols.includes('data') && !oldCols.includes('home_team_id')) {
  db.exec('DROP TABLE IF EXISTS matches');
  console.log('[db] migrated matches table to columnar schema');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id                TEXT PRIMARY KEY,
    -- primary source
    home_team_id      TEXT,
    away_team_id      TEXT,
    home_team_name_en TEXT,
    away_team_name_en TEXT,
    home_team_label   TEXT,
    away_team_label   TEXT,
    home_score        TEXT,
    away_score        TEXT,
    home_scorers      TEXT,
    away_scorers      TEXT,
    group_name        TEXT,
    matchday          TEXT,
    local_date        TEXT,
    stadium_id        TEXT,
    finished          TEXT,
    time_elapsed      TEXT,
    type              TEXT,
    primary_updated_at INTEGER,
    -- enrichment (source-agnostic)
    clock             TEXT,
    clock_seconds     REAL,
    period            TEXT,
    events            TEXT,
    enriched_at       INTEGER,
    -- predictions
    pred_home         INTEGER,
    pred_away         INTEGER,
    pred_scores       TEXT,
    win_home          REAL,
    win_draw          REAL,
    win_away          REAL,
    pred_updated_at   INTEGER
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

// Add prediction columns if missing (migration for existing DBs)
{
  const cols = db.pragma('table_info(matches)').map(c => c.name);
  const toAdd = [
    ['pred_home',       'INTEGER'],
    ['pred_away',       'INTEGER'],
    ['pred_scores',     'TEXT'],
    ['win_home',        'REAL'],
    ['win_draw',        'REAL'],
    ['win_away',        'REAL'],
    ['pred_updated_at', 'INTEGER'],
    ['ou_line',         'REAL'],
    ['h2h_home',        'REAL'],
    ['h2h_draw',        'REAL'],
    ['h2h_away',        'REAL'],
  ];
  for (const [col, type] of toAdd) {
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE matches ADD COLUMN ${col} ${type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const _upsertPrimary = db.prepare(`
  INSERT INTO matches (
    id, home_team_id, away_team_id, home_team_name_en, away_team_name_en,
    home_team_label, away_team_label, home_score, away_score,
    home_scorers, away_scorers, group_name, matchday, local_date,
    stadium_id, finished, time_elapsed, type, primary_updated_at
  ) VALUES (
    @id, @home_team_id, @away_team_id, @home_team_name_en, @away_team_name_en,
    @home_team_label, @away_team_label, @home_score, @away_score,
    @home_scorers, @away_scorers, @group_name, @matchday, @local_date,
    @stadium_id, @finished, @time_elapsed, @type, @primary_updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    home_team_id       = excluded.home_team_id,
    away_team_id       = excluded.away_team_id,
    home_team_name_en  = excluded.home_team_name_en,
    away_team_name_en  = excluded.away_team_name_en,
    home_team_label    = excluded.home_team_label,
    away_team_label    = excluded.away_team_label,
    home_score         = excluded.home_score,
    away_score         = excluded.away_score,
    home_scorers       = excluded.home_scorers,
    away_scorers       = excluded.away_scorers,
    group_name         = excluded.group_name,
    matchday           = excluded.matchday,
    local_date         = excluded.local_date,
    stadium_id         = excluded.stadium_id,
    finished           = excluded.finished,
    time_elapsed       = excluded.time_elapsed,
    type               = excluded.type,
    primary_updated_at = excluded.primary_updated_at
`);

const _upsertEnrichment = db.prepare(`
  INSERT INTO matches (id, clock, clock_seconds, period, events, enriched_at)
  VALUES (@id, @clock, @clock_seconds, @period, @events, @enriched_at)
  ON CONFLICT(id) DO UPDATE SET
    clock         = excluded.clock,
    clock_seconds = excluded.clock_seconds,
    period        = excluded.period,
    events        = excluded.events,
    enriched_at   = excluded.enriched_at
`);

const _upsertPrediction = db.prepare(`
  INSERT INTO matches (id, pred_home, pred_away, pred_scores, win_home, win_draw, win_away, pred_updated_at)
  VALUES (@id, @pred_home, @pred_away, @pred_scores, @win_home, @win_draw, @win_away, @pred_updated_at)
  ON CONFLICT(id) DO UPDATE SET
    pred_home       = excluded.pred_home,
    pred_away       = excluded.pred_away,
    pred_scores     = excluded.pred_scores,
    win_home        = excluded.win_home,
    win_draw        = excluded.win_draw,
    win_away        = excluded.win_away,
    pred_updated_at = excluded.pred_updated_at
`);

const _upsertOdds = db.prepare(`
  INSERT INTO matches (id, ou_line, h2h_home, h2h_draw, h2h_away)
  VALUES (@id, @ou_line, @h2h_home, @h2h_draw, @h2h_away)
  ON CONFLICT(id) DO UPDATE SET
    ou_line  = COALESCE(excluded.ou_line,  ou_line),
    h2h_home = COALESCE(excluded.h2h_home, h2h_home),
    h2h_draw = COALESCE(excluded.h2h_draw, h2h_draw),
    h2h_away = COALESCE(excluded.h2h_away, h2h_away)
`);

const _upsertGroup   = db.prepare('INSERT INTO groups_tbl (name, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
const _upsertTeam    = db.prepare('INSERT INTO teams (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
const _upsertStadium = db.prepare('INSERT INTO stadiums (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');

export const savePrimary     = db.transaction((rows) => { for (const r of rows) _upsertPrimary.run(r); });
export const saveEnrichment  = db.transaction((rows) => { for (const r of rows) _upsertEnrichment.run(r); });
export const savePredictions = db.transaction((rows) => { for (const r of rows) _upsertPrediction.run(r); });
export const saveOdds        = db.transaction((rows) => { for (const r of rows) _upsertOdds.run(r); });
export const saveGroups     = db.transaction((rows) => { const now = Date.now(); for (const r of rows) _upsertGroup.run(r.name, JSON.stringify(r), now); });
export const saveTeams      = db.transaction((rows) => { const now = Date.now(); for (const r of rows) _upsertTeam.run(r.id, JSON.stringify(r), now); });
export const saveStadiums   = db.transaction((rows) => { const now = Date.now(); for (const r of rows) _upsertStadium.run(r.id, JSON.stringify(r), now); });

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function rowToGame(row) {
  return {
    id:                row.id,
    home_team_id:      row.home_team_id,
    away_team_id:      row.away_team_id,
    home_team_name_en: row.home_team_name_en,
    away_team_name_en: row.away_team_name_en,
    home_team_label:   row.home_team_label,
    away_team_label:   row.away_team_label,
    home_score:        row.home_score,
    away_score:        row.away_score,
    home_scorers:      row.home_scorers,
    away_scorers:      row.away_scorers,
    group:             row.group_name,
    matchday:          row.matchday,
    local_date:        row.local_date,
    stadium_id:        row.stadium_id,
    finished:          row.finished,
    time_elapsed:      row.time_elapsed,
    type:              row.type,
    clock:             row.clock         ?? null,
    clock_seconds:     row.clock_seconds ?? null,
    period:            row.period        ?? null,
    events:            row.events ? JSON.parse(row.events) : null,
    enriched_at:       row.enriched_at   ?? null,
    pred_home:         row.pred_home     ?? null,
    pred_away:         row.pred_away     ?? null,
    pred_scores:       row.pred_scores   ? JSON.parse(row.pred_scores) : null,
    win_home:          row.win_home      ?? null,
    win_draw:          row.win_draw      ?? null,
    win_away:          row.win_away      ?? null,
    ou_line:           row.ou_line       ?? null,
    h2h_home:          row.h2h_home      ?? null,
    h2h_draw:          row.h2h_draw      ?? null,
    h2h_away:          row.h2h_away      ?? null,
  };
}

export function loadMatches()  { return db.prepare('SELECT * FROM matches').all().map(rowToGame); }
export function loadGroups()   { return db.prepare('SELECT data FROM groups_tbl').all().map(r => JSON.parse(r.data)); }
export function loadTeams()    { return db.prepare('SELECT data FROM teams').all().map(r => JSON.parse(r.data)); }
export function loadStadiums() { return db.prepare('SELECT data FROM stadiums').all().map(r => JSON.parse(r.data)); }
