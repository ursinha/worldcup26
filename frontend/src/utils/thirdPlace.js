/**
 * 3rd-place ranking and bracket slot assignment.
 */

/**
 * Extract and rank all 3rd-place teams from projected groups.
 *
 * @param {Array} groups - projected groups (sorted standings)
 * @returns {Array} ranked 3rd-place entries: { group, team_id, mp, w, d, l, gf, ga, gd, pts, isLive }
 *                  sorted by pts → gd → gf, with `qualifying` flag (top 8)
 */
export function rankThirdPlaceTeams(groups) {
  if (!groups?.length) return [];

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
      });
    }
  }

  // Sort by FIFA best-3rd tiebreakers: pts → gd → gf
  thirds.sort((a, b) => {
    if (+b.pts !== +a.pts) return +b.pts - +a.pts;
    if (+b.gd !== +a.gd) return +b.gd - +a.gd;
    return +b.gf - +a.gf;
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
