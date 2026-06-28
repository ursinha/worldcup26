/**
 * Poisson-based match score prediction with bookmaker calibration.
 *
 * Three calibration levels, applied in order of available data:
 *
 *  Level 3 (full)  — ou_line + h2h odds available:
 *    Binary-search for the λ_home/λ_away ratio that makes
 *    P(home wins | DC-Poisson) == bookmaker h2h win probability,
 *    while keeping λ_home + λ_away == ou_line.
 *    Win/draw/away percentages taken directly from h2h odds.
 *    Score chips come from the fully-calibrated DC-Poisson grid.
 *
 *  Level 2 (partial) — only ou_line available:
 *    Scale tournament-derived λ values so their sum == ou_line.
 *    Win percentages from Poisson.
 *
 *  Level 1 (fallback) — no odds:
 *    Pure tournament attack/defense ratings with Bayesian smoothing.
 */

import { strengthByTeamId, priorMultipliers } from './teamStrength.js';

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/**
 * Dixon-Coles correction factor for low-scoring outcomes.
 * ρ < 0 increases 0-0 and 1-1 probability while decreasing 1-0 and 0-1,
 * correcting the standard Poisson model's known mispricing of these scores.
 * Mathematically designed to preserve the total probability sum.
 */
const RHO = -0.1;

function dcTau(h, a, lh, la) {
  if (h === 0 && a === 0) return 1 - lh * la * RHO;
  if (h === 1 && a === 0) return 1 + la * RHO;
  if (h === 0 && a === 1) return 1 + lh * RHO;
  if (h === 1 && a === 1) return 1 - RHO;
  return 1;
}

function dcPmf(h, a, lh, la) {
  return poissonPmf(h, lh) * poissonPmf(a, la) * dcTau(h, a, lh, la);
}

function homeWinProb(lh, la, maxGoals) {
  let p = 0;
  for (let h = 1; h < maxGoals; h++)
    for (let a = 0; a < h; a++)
      p += dcPmf(h, a, lh, la);
  return p;
}

/**
 * Binary-search for the share r ∈ [0.05, 0.95] such that
 * P(home wins | λ_h = r * total, λ_a = (1-r) * total) ≈ targetHomeWin.
 */
function findLambdaRatio(total, targetHomeWin, maxGoals) {
  let lo = 0.05, hi = 0.95;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (homeWinProb(mid * total, (1 - mid) * total, maxGoals) > targetHomeWin) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Derive attack / defense ratings from finished group stage matches.
 * Returns null if there are fewer than 2 finished games.
 *
 * @param {Array}  games
 * @param {Object} priors - { id: { attMult, defMult } } strength prior the
 *   Bayesian smoothing pulls toward (instead of a flat league average). Missing
 *   teams default to neutral {1,1}, so an empty object == the old flat-prior
 *   behavior.
 */
export function computeRatings(games, priors = {}) {
  const finished = games.filter(g => g.finished === 'TRUE' && g.type === 'group'
    && g.home_score != null && g.away_score != null);

  if (finished.length < 2) return null;

  let totalGoals = 0;
  const stats = {};

  for (const g of finished) {
    const hs = +g.home_score;
    const as_ = +g.away_score;
    totalGoals += hs + as_;

    for (const [id, scored, conceded] of [
      [g.home_team_id, hs, as_],
      [g.away_team_id, as_, hs],
    ]) {
      if (!id || id === '0') continue;
      if (!stats[id]) stats[id] = { scored: 0, conceded: 0, games: 0 };
      stats[id].scored   += scored;
      stats[id].conceded += conceded;
      stats[id].games++;
    }
  }

  const leagueAvg = totalGoals / (finished.length * 2);

  // Bayesian smoothing: pull ratings toward each team's strength prior,
  // weighted by games played (more games → less smoothing). With no prior the
  // target is the league average (attMult/defMult = 1), i.e. the old behavior.
  const SMOOTH = 2;

  // Cover every team that has games OR a strength prior, so a team that hasn't
  // played yet still resolves to its pure prior.
  const ids = new Set([...Object.keys(stats), ...Object.keys(priors)]);

  const ratings = {};
  for (const id of ids) {
    const s = stats[id] ?? { scored: 0, conceded: 0, games: 0 };
    const { attMult = 1, defMult = 1 } = priors[id] ?? {};
    ratings[id] = {
      attack:  ((s.scored   + leagueAvg * attMult * SMOOTH) / (s.games + SMOOTH)) / leagueAvg,
      defense: ((s.conceded + leagueAvg * defMult * SMOOTH) / (s.games + SMOOTH)) / leagueAvg,
    };
  }

  return { ratings, leagueAvg };
}

const FALLBACK_RATING = { attack: 1, defense: 1 };
const MAX_GOALS = 11; // covers λ up to ~6 with <1% truncation

/**
 * Predict score probabilities for a single match.
 *
 * @param {string}      homeId
 * @param {string}      awayId
 * @param {object}      model       — from computeRatings()
 * @param {number|null} ouLine      — bookmaker O/U total goals
 * @param {number|null} h2hHome     — bookmaker home win % (0–100)
 * @param {number|null} h2hDraw     — bookmaker draw %
 * @param {number|null} h2hAway     — bookmaker away win %
 */
export function predictMatch(homeId, awayId, model, ouLine = null, h2hHome = null, h2hDraw = null, h2hAway = null) {
  if (!model || !homeId || !awayId || homeId === '0' || awayId === '0') return null;

  const { ratings, leagueAvg } = model;
  const homeR = ratings[homeId] ?? FALLBACK_RATING;
  const awayR = ratings[awayId] ?? FALLBACK_RATING;

  let lh = leagueAvg * homeR.attack * awayR.defense;
  let la = leagueAvg * awayR.attack * homeR.defense;

  const hasH2H   = h2hHome != null && h2hDraw != null && h2hAway != null;
  const hasOuLine = ouLine != null;

  if (hasOuLine && hasH2H) {
    // Level 3: calibrate both total goals AND home/away split from bookmaker data
    const targetHomeWin = h2hHome / 100;
    const r = findLambdaRatio(ouLine, targetHomeWin, MAX_GOALS);
    lh = r * ouLine;
    la = (1 - r) * ouLine;
  } else if (hasOuLine && lh + la > 0) {
    // Level 2: scale total to match O/U, keep tournament-derived ratio
    const scale = ouLine / (lh + la);
    lh *= scale;
    la *= scale;
  }
  // Level 1: use raw tournament λ values as-is

  // Build score probability matrix
  const scores = [];
  let winHome = 0, winDraw = 0, winAway = 0;

  for (let h = 0; h < MAX_GOALS; h++) {
    for (let a = 0; a < MAX_GOALS; a++) {
      const prob = dcPmf(h, a, lh, la);
      scores.push({ home: h, away: a, prob });
      if (h > a) winHome += prob;
      else if (h === a) winDraw += prob;
      else winAway += prob;
    }
  }

  scores.sort((a, b) => b.prob - a.prob);
  const top = scores.slice(0, 5).map(s => ({
    home: s.home,
    away: s.away,
    prob: Math.round(s.prob * 1000) / 10,
  }));

  // Win percentages: use h2h directly when available (bookmaker quality),
  // otherwise normalize Poisson values to sum to 100%.
  let finalWinHome, finalWinDraw, finalWinAway;
  if (hasH2H) {
    finalWinHome = h2hHome;
    finalWinDraw = h2hDraw;
    finalWinAway = h2hAway;
  } else {
    const total = winHome + winDraw + winAway || 1;
    finalWinHome = Math.round(winHome / total * 1000) / 10;
    finalWinDraw = Math.round(winDraw / total * 1000) / 10;
    finalWinAway = Math.round(winAway / total * 1000) / 10;
  }

  return {
    pred_home:   top[0].home,
    pred_away:   top[0].away,
    pred_scores: JSON.stringify(top),
    win_home:    finalWinHome,
    win_draw:    finalWinDraw,
    win_away:    finalWinAway,
  };
}

/**
 * Compute predictions for all upcoming matches and return upsertable rows.
 *
 * @param {Array} games
 * @param {Array} teams - team metadata, for the strength prior (optional)
 */
export function computeAllPredictions(games, teams = []) {
  const priors = priorMultipliers(strengthByTeamId(teams));
  const model = computeRatings(games, priors);
  if (!model) return [];

  const now = Date.now();
  const upcoming = games.filter(g =>
    g.finished === 'FALSE' && g.time_elapsed === 'notstarted'
    && g.home_team_id && g.home_team_id !== '0'
    && g.away_team_id && g.away_team_id !== '0',
  );

  const rows = [];
  for (const g of upcoming) {
    const pred = predictMatch(
      g.home_team_id, g.away_team_id, model,
      g.ou_line  ?? null,
      g.h2h_home ?? null,
      g.h2h_draw ?? null,
      g.h2h_away ?? null,
    );
    if (!pred) continue;
    rows.push({ id: g.id, ...pred, pred_updated_at: now });
  }
  return rows;
}
