/**
 * Pre-tournament team strength, used as the Bayesian prior in the prediction
 * model (predictions.js). Keyed by FIFA code, seeded from a pre-WC-2026 FIFA
 * world-ranking snapshot.
 *
 * Deliberately a PRE-tournament snapshot: the model already captures
 * in-tournament form via match-derived ratings, so the prior must not absorb
 * World Cup results (that would double-count). Values are approximate — only the
 * relative ordering/spread matters (they're normalized at runtime) — so edit
 * freely.
 */
export const TEAM_STRENGTH = {
  ARG: 1885, ESP: 1875, FRA: 1870, BRA: 1855, ENG: 1820, BEL: 1765, POR: 1780,
  NED: 1750, CRO: 1720, GER: 1715, MAR: 1710, COL: 1690, URU: 1680, USA: 1665,
  JPN: 1655, MEX: 1650, SUI: 1650, SEN: 1645, IRN: 1640, AUT: 1580, KOR: 1575,
  ECU: 1570, TUR: 1560, SWE: 1545, CAN: 1540, NOR: 1530, EGY: 1515, CIV: 1510,
  ALG: 1505, CZE: 1500, SCO: 1500, AUS: 1500, TUN: 1490, PAR: 1480, PAN: 1435,
  RSA: 1432, QAT: 1430, BIH: 1430, KSA: 1420, COD: 1415, GHA: 1395, JOR: 1390,
  IRQ: 1380, CPV: 1378, UZB: 1375, HAI: 1315, CUW: 1305, NZL: 1300,
};

// Strength → goal-multiplier spread. Larger = the prior separates strong/weak
// teams more. ~0.3 is moderate.
const K = 0.3;

/**
 * Map team id → strength points, for the teams we have a rating for.
 * @param {Array} teams - team metadata objects (with `id` and `fifa_code`)
 */
export function strengthByTeamId(teams) {
  const out = {};
  for (const t of teams ?? []) {
    const pts = TEAM_STRENGTH[t?.fifa_code];
    if (pts != null && t.id != null) out[t.id] = pts;
  }
  return out;
}

/**
 * Convert per-team strength into prior attack/defense multipliers. Each team's
 * points are z-scored over the whole field, then mapped to
 * attack = exp(K·z) (strong scores more) and defense = exp(−K·z) (strong
 * concedes less). Teams without a strength entry get neutral {1, 1}.
 *
 * @param {Object} strengthById - { id: points }
 * @returns {Object} { id: { attMult, defMult } }
 */
export function priorMultipliers(strengthById) {
  const ids = Object.keys(strengthById ?? {});
  if (!ids.length) return {};

  const field = Object.values(TEAM_STRENGTH);
  const mean = field.reduce((s, v) => s + v, 0) / field.length;
  const variance = field.reduce((s, v) => s + (v - mean) ** 2, 0) / field.length;
  const sd = Math.sqrt(variance) || 1;

  const out = {};
  for (const id of ids) {
    const z = (strengthById[id] - mean) / sd;
    out[id] = { attMult: Math.exp(K * z), defMult: Math.exp(-K * z) };
  }
  return out;
}
