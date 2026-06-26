import { matchStatus } from './parsers';

/**
 * Sort teams by pts → gd → gf (standard FIFA tiebreaker).
 */
function sortTeams(teams) {
  return [...teams].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });
}

/**
 * Project current live match scores into group standings.
 *
 * @param {Array} groups   - groups from /api/groups (each has .name, .teams[])
 * @param {Array} matches  - games from /api/matches
 * @returns {Array} new groups array with projected standings and `isLive` flag on affected teams
 */
export function projectStandings(groups, matches) {
  if (!groups?.length || !matches?.length) return groups ?? [];

  // Find live group matches
  const liveGroupMatches = matches.filter(
    (g) => g.type === 'group' && matchStatus(g) === 'live',
  );

  if (liveGroupMatches.length === 0) return groups;

  // Build a map: groupName → [{ team_id, deltaStats }]
  const deltaMap = {};
  for (const m of liveGroupMatches) {
    const grp = m.group;
    if (!grp) continue;
    if (!deltaMap[grp]) deltaMap[grp] = {};

    const homeId = m.home_team_id;
    const awayId = m.away_team_id;
    const homeScore = +m.home_score || 0;
    const awayScore = +m.away_score || 0;

    // Initialize deltas
    if (!deltaMap[grp][homeId]) deltaMap[grp][homeId] = { mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    if (!deltaMap[grp][awayId]) deltaMap[grp][awayId] = { mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };

    const hd = deltaMap[grp][homeId];
    const ad = deltaMap[grp][awayId];

    // Match played
    hd.mp += 1;
    ad.mp += 1;

    // Goals
    hd.gf += homeScore;
    hd.ga += awayScore;
    hd.gd += homeScore - awayScore;
    ad.gf += awayScore;
    ad.ga += homeScore;
    ad.gd += awayScore - homeScore;

    // Result
    if (homeScore > awayScore) {
      hd.w += 1; hd.pts += 3;
      ad.l += 1;
    } else if (homeScore === awayScore) {
      hd.d += 1; hd.pts += 1;
      ad.d += 1; ad.pts += 1;
    } else {
      hd.l += 1;
      ad.w += 1; ad.pts += 3;
    }
  }

  // Apply deltas to cloned groups
  return groups.map((group) => {
    const groupDeltas = deltaMap[group.name];
    if (!groupDeltas) return group;

    const projectedTeams = group.teams.map((entry) => {
      const delta = groupDeltas[entry.team_id];
      if (!delta) return entry;

      return {
        ...entry,
        mp:  +entry.mp  + delta.mp,
        w:   +entry.w   + delta.w,
        d:   +entry.d   + delta.d,
        l:   +entry.l   + delta.l,
        gf:  +entry.gf  + delta.gf,
        ga:  +entry.ga  + delta.ga,
        gd:  +entry.gd  + delta.gd,
        pts: +entry.pts + delta.pts,
        isLive: true,
      };
    });

    return {
      ...group,
      teams: sortTeams(projectedTeams),
    };
  });
}
