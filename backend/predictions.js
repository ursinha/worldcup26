/**
 * Poisson-based match score prediction with bookmaker calibration.
 *
 * Three calibration levels, applied in order of available data:
 *
 *  Level 3 (full)  — ou_line + h2h odds available:
 *    Binary-search for the λ_home/λ_away ratio that makes
 *    P(home wins | Poisson) == bookmaker h2h win probability,
 *    while keeping λ_home + λ_away == ou_line.
 *    Win/draw/away percentages taken directly from h2h odds.
 *    Score chips come from the fully-calibrated Poisson grid.
 *
 *  Level 2 (partial) — only ou_line available:
 *    Scale tournament-derived λ values so their sum == ou_line.
 *    Win percentages from Poisson.
 *
 *  Level 1 (fallback) — no odds:
 *    Pure tournament attack/defense ratings with Bayesian smoothing.
 */

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function homeWinProb(lh, la, maxGoals) {
  let p = 0;
  for (let h = 1; h < maxGoals; h++)
    for (let a = 0; a < h; a++)
      p += poissonPmf(h, lh) * poissonPmf(a, la);
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
 */
export function computeRatings(games) {
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

  // Bayesian smoothing: pull extreme ratings toward the mean,
  // weighted by games played (more games → less smoothing).
  const SMOOTH = 2;

  const ratings = {};
  for (const [id, s] of Object.entries(stats)) {
    ratings[id] = {
      attack:  ((s.scored   + leagueAvg * SMOOTH) / (s.games + SMOOTH)) / leagueAvg,
      defense: ((s.conceded + leagueAvg * SMOOTH) / (s.games + SMOOTH)) / leagueAvg,
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
      const prob = poissonPmf(h, lh) * poissonPmf(a, la);
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
 */
export function computeAllPredictions(games) {
  const model = computeRatings(games);
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
