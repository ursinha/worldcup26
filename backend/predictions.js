/**
 * Poisson-based match score prediction.
 *
 * Uses each team's attack and defense strength derived from finished
 * group stage results to estimate expected goals (λ) per side, then
 * computes a full score probability matrix via the Poisson distribution.
 *
 * Option 3 hook: pass oddsTotal to calibrate λ against a bookmaker
 * Over/Under line — the only change needed to upgrade from Option 1.
 */

function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/**
 * Derive attack / defense ratings from finished matches.
 * Returns null if there are not enough matches to compute meaningful ratings.
 */
export function computeRatings(games) {
  const finished = games.filter(g => g.finished === 'TRUE' && g.type === 'group'
    && g.home_score != null && g.away_score != null);

  if (finished.length < 2) return null;

  let totalGoals = 0;
  const stats = {}; // teamId → { scored, conceded, games }

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

  const leagueAvg = totalGoals / (finished.length * 2); // per team per game

  // Bayesian smoothing: add virtual games at the league average to prevent
  // extreme ratings from small samples (e.g. a team with 0 goals conceded
  // in one game getting a defense rating of 0, making opponents score 0).
  const SMOOTH = 2; // virtual games added per team

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
const MAX_GOALS = 11; // consider 0–10 goals per side (covers λ up to ~6)

/**
 * Predict score probabilities for a single match.
 * @param {string} homeId
 * @param {string} awayId
 * @param {{ ratings: object, leagueAvg: number }} model
 * @param {number|null} oddsTotal  Option 3: bookmaker O/U total (leave null for Option 1)
 * @returns {{ pred_home, pred_away, pred_scores, win_home, win_draw, win_away } | null}
 */
export function predictMatch(homeId, awayId, model, oddsTotal = null) {
  if (!model || !homeId || !awayId || homeId === '0' || awayId === '0') return null;

  const { ratings, leagueAvg } = model;
  const homeR = ratings[homeId] ?? FALLBACK_RATING;
  const awayR = ratings[awayId] ?? FALLBACK_RATING;

  let lh = leagueAvg * homeR.attack * awayR.defense;
  let la = leagueAvg * awayR.attack * homeR.defense;

  // Option 3 hook: scale λ to match bookmaker total
  if (oddsTotal != null && lh + la > 0) {
    const scale = oddsTotal / (lh + la);
    lh *= scale;
    la *= scale;
  }

  // Build full score probability matrix
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
    prob: Math.round(s.prob * 1000) / 10, // % with 1 decimal
  }));

  // Normalize so percentages always sum to 100 (the MAX_GOALS cutoff
  // loses a small amount of probability mass for high-λ matches).
  const total = winHome + winDraw + winAway || 1;

  return {
    pred_home:  top[0].home,
    pred_away:  top[0].away,
    pred_scores: JSON.stringify(top),
    win_home:   Math.round(winHome / total * 1000) / 10,
    win_draw:   Math.round(winDraw / total * 1000) / 10,
    win_away:   Math.round(winAway / total * 1000) / 10,
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
    const pred = predictMatch(g.home_team_id, g.away_team_id, model);
    if (!pred) continue;
    rows.push({ id: g.id, ...pred, pred_updated_at: now });
  }
  return rows;
}
