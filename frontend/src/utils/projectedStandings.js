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
 * Compute group standings entirely from match results.
 *
 * Finished matches are the source of truth. Live matches are projected
 * on top with the `isLive` flag set on affected teams.
 *
 * @param {Array} groups   - groups from /api/groups (used for group structure + team membership)
 * @param {Array} matches  - games from /api/matches
 * @returns {Array} groups with computed standings, sorted by pts → gd → gf
 */
export function projectStandings(groups, matches) {
  if (!groups?.length) return [];

  // Initialize empty standings for every team in every group
  const standingsMap = {};
  for (const group of groups) {
    standingsMap[group.name] = {};
    for (const team of group.teams) {
      standingsMap[group.name][team.team_id] = {
        team_id: team.team_id,
        mp: 0, w: 0, d: 0, l: 0,
        gf: 0, ga: 0, gd: 0, pts: 0,
        isLive: false,
      };
    }
  }

  if (!matches?.length) return groups;

  // Process all group matches (finished + live)
  for (const m of matches) {
    if (m.type !== 'group' || !m.group) continue;

    const status = matchStatus(m);
    if (status === 'notstarted') continue;

    const grpStandings = standingsMap[m.group];
    if (!grpStandings) continue;

    const homeId = m.home_team_id;
    const awayId = m.away_team_id;
    if (!grpStandings[homeId] || !grpStandings[awayId]) continue;

    const homeScore = +m.home_score || 0;
    const awayScore = +m.away_score || 0;
    const isLive = status === 'live';

    const home = grpStandings[homeId];
    const away = grpStandings[awayId];

    // Matches played
    home.mp += 1;
    away.mp += 1;

    // Goals
    home.gf += homeScore;
    home.ga += awayScore;
    home.gd += homeScore - awayScore;
    away.gf += awayScore;
    away.ga += homeScore;
    away.gd += awayScore - homeScore;

    // Result
    if (homeScore > awayScore) {
      home.w += 1; home.pts += 3;
      away.l += 1;
    } else if (homeScore === awayScore) {
      home.d += 1; home.pts += 1;
      away.d += 1; away.pts += 1;
    } else {
      home.l += 1;
      away.w += 1; away.pts += 3;
    }

    // Mark teams involved in live matches
    if (isLive) {
      home.isLive = true;
      away.isLive = true;
    }
  }

  // Build result groups with sorted standings
  return groups.map((group) => ({
    ...group,
    teams: sortTeams(Object.values(standingsMap[group.name])),
  }));
}
