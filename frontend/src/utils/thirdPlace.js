/**
 * 3rd-place ranking and bracket slot assignment.
 */

// ---------------------------------------------------------------------------
// Fair play points from match events
// ---------------------------------------------------------------------------

/**
 * FIFA fair play point deductions per card type:
 *   yellow card          = -1
 *   indirect red (2× yellow) = -3
 *   direct red           = -4
 *   yellow + direct red (same game) = -5
 *
 * Since we can't distinguish indirect vs direct red from the event data alone,
 * we treat all red_card events as direct reds (-4) and yellow_card as -1.
 * This is a simplification but matches the most common scoring approach
 * when detailed card subtypes aren't available.
 */
const CARD_POINTS = {
  yellow_card: -1,
  red_card: -4,
};

/**
 * Compute fair play points per team from group match events.
 *
 * @param {Array} matches - all matches from /api/matches
 * @returns {Object} { teamId: fairPlayPoints (negative = worse) }
 */
function computeFairPlayPoints(matches) {
  const fpp = {};
  if (!matches?.length) return fpp;

  for (const match of matches) {
    if (match.type !== 'group') continue;
    if (!match.events?.length) continue;

    const teamIds = { home: match.home_team_id, away: match.away_team_id };

    for (const event of match.events) {
      const pts = CARD_POINTS[event.type];
      if (pts === undefined) continue;
      const teamId = teamIds[event.team];
      if (!teamId) continue;
      fpp[teamId] = (fpp[teamId] || 0) + pts;
    }
  }

  return fpp;
}

// ---------------------------------------------------------------------------
// 3rd-place ranking
// ---------------------------------------------------------------------------

/**
 * Extract and rank all 3rd-place teams from projected groups.
 *
 * FIFA tiebreakers for best third-placed teams:
 *   1. Points
 *   2. Goal difference
 *   3. Goals scored
 *   4. Fair play points (fewer deductions = better)
 *   5. Drawing of lots (cannot be implemented)
 *
 * @param {Array} groups  - projected groups (sorted standings)
 * @param {Array} matches - all matches from /api/matches (for fair play calculation)
 * @returns {Array} ranked 3rd-place entries with `qualifying` flag (top 8)
 */
export function rankThirdPlaceTeams(groups, matches) {
  if (!groups?.length) return [];

  const fpp = computeFairPlayPoints(matches);

  // Sort teams within each group and pick index 2 (3rd place)
  const thirds = [];
  for (const group of groups) {
    const sorted = [...group.teams].sort((a, b) => {
      if (+b.pts !== +a.pts) return +b.pts - +a.pts;
      if (+b.gd !== +a.gd) return +b.gd - +a.gd;
      return +b.gf - +a.gf;
    });

    if (sorted.length >= 3) {
      thirds.push({
        ...sorted[2],
        group: group.name,
        fpp: fpp[sorted[2].team_id] || 0,
      });
    }
  }

  // Sort by FIFA best-3rd tiebreakers: pts → gd → gf → fair play (higher = better)
  thirds.sort((a, b) => {
    if (+b.pts !== +a.pts) return +b.pts - +a.pts;
    if (+b.gd !== +a.gd) return +b.gd - +a.gd;
    if (+b.gf !== +a.gf) return +b.gf - +a.gf;
    return b.fpp - a.fpp; // less negative = fewer cards = better
  });

  // Top 8 qualify, bottom 4 eliminated
  return thirds.map((t, i) => ({
    ...t,
    qualifying: i < 8,
  }));
}

// ---------------------------------------------------------------------------
// Bracket slot assignment for qualifying 3rd-place teams
// ---------------------------------------------------------------------------

/**
 * R32 slots that take a 3rd-place team, with candidate groups for each.
 */
export const THIRD_PLACE_SLOTS = [
  { matchId: '74', candidates: ['A', 'B', 'C', 'D', 'F'] },
  { matchId: '77', candidates: ['C', 'D', 'F', 'G', 'H'] },
  { matchId: '79', candidates: ['C', 'E', 'F', 'H', 'I'] },
  { matchId: '80', candidates: ['E', 'H', 'I', 'J', 'K'] },
  { matchId: '81', candidates: ['B', 'E', 'F', 'I', 'J'] },
  { matchId: '82', candidates: ['A', 'E', 'H', 'I', 'J'] },
  { matchId: '85', candidates: ['E', 'F', 'G', 'I', 'J'] },
  { matchId: '87', candidates: ['D', 'E', 'I', 'J', 'L'] },
];

/**
 * Find a valid assignment of qualifying groups to R32 slots using backtracking.
 * Each slot gets exactly one group from its candidate list.
 * Each qualifying group is assigned to exactly one slot.
 *
 * @param {string[]} qualifyingGroups - the 8 group letters that qualify
 * @returns {Object|null} { matchId: groupLetter } or null if no valid assignment
 */
export function resolveThirdPlaceSlots(qualifyingGroups) {
  if (!qualifyingGroups || qualifyingGroups.length !== 8) return null;

  const qualSet = new Set(qualifyingGroups);
  const slots = THIRD_PLACE_SLOTS.map((s) => ({
    matchId: s.matchId,
    candidates: s.candidates.filter((c) => qualSet.has(c)),
  }));

  // Sort slots by number of candidates (most constrained first) for faster solving
  const sortedSlots = [...slots].sort((a, b) => a.candidates.length - b.candidates.length);

  const assignment = {};
  const used = new Set();

  function backtrack(idx) {
    if (idx === sortedSlots.length) return true;
    const slot = sortedSlots[idx];
    for (const group of slot.candidates) {
      if (used.has(group)) continue;
      used.add(group);
      assignment[slot.matchId] = group;
      if (backtrack(idx + 1)) return true;
      used.delete(group);
      delete assignment[slot.matchId];
    }
    return false;
  }

  return backtrack(0) ? { ...assignment } : null;
}
