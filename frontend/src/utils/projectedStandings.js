import { matchStatus } from './parsers';
import { computeFairPlayPoints } from './thirdPlace';

/**
 * Compare two teams by the overall FIFA criteria (applied across all group
 * matches): 1) points, 2) goal difference, 3) goals scored.
 * Returns 0 when teams are level on all three — the head-to-head tiebreaker
 * then decides between them.
 */
export function compareByOverall(a, b) {
  if (+b.pts !== +a.pts) return +b.pts - +a.pts;
  if (+b.gd !== +a.gd) return +b.gd - +a.gd;
  return +b.gf - +a.gf;
}

/**
 * Order a set of teams that are level on points/GD/GF using the FIFA 2026
 * tiebreakers that come next:
 *   d) points in the matches between the teams concerned
 *   e) goal difference in those matches
 *   f) goals scored in those matches
 *   g) fair play points (fewer card deductions = better)
 * Drawing of lots (h) cannot be implemented and leaves order stable.
 */
function headToHeadOrder(tiedTeams, matchRecords, fpp) {
  const ids = new Set(tiedTeams.map((t) => t.team_id));
  const mini = {};
  for (const t of tiedTeams) mini[t.team_id] = { pts: 0, gd: 0, gf: 0 };

  for (const m of matchRecords) {
    if (!ids.has(m.homeId) || !ids.has(m.awayId)) continue;
    const h = mini[m.homeId];
    const a = mini[m.awayId];
    h.gf += m.homeScore; h.gd += m.homeScore - m.awayScore;
    a.gf += m.awayScore; a.gd += m.awayScore - m.homeScore;
    if (m.homeScore > m.awayScore) h.pts += 3;
    else if (m.homeScore < m.awayScore) a.pts += 3;
    else { h.pts += 1; a.pts += 1; }
  }

  return [...tiedTeams].sort((a, b) => {
    const ma = mini[a.team_id];
    const mb = mini[b.team_id];
    if (mb.pts !== ma.pts) return mb.pts - ma.pts;
    if (mb.gd !== ma.gd) return mb.gd - ma.gd;
    if (mb.gf !== ma.gf) return mb.gf - ma.gf;
    return (fpp[b.team_id] || 0) - (fpp[a.team_id] || 0); // less negative = fewer cards
  });
}

/**
 * Full FIFA standings sort: overall criteria first, then head-to-head within
 * any run of teams that remain level.
 */
export function sortStandings(teams, matchRecords, fpp) {
  const sorted = [...teams].sort(compareByOverall);
  const result = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && compareByOverall(sorted[i], sorted[j]) === 0) j++;
    if (j - i === 1) {
      result.push(sorted[i]);
    } else {
      result.push(...headToHeadOrder(sorted.slice(i, j), matchRecords, fpp));
    }
    i = j;
  }
  return result;
}

/**
 * A group is decided once every team has *finished* all its matches
 * (num_teams - 1 each). Based on finished games only — a match in progress
 * does not make the group complete.
 */
export function isGroupComplete(teams) {
  if (!teams?.length) return false;
  const needed = teams.length - 1;
  return teams.every((t) => (+t.played || 0) >= needed);
}

/**
 * Compute group standings entirely from match results.
 *
 * Finished matches are the source of truth. Live matches are projected
 * on top with the `isLive` flag set on affected teams. Each team carries
 * both `mp` (finished + live, the provisional games-played shown in the table)
 * and `played` (finished only, used to decide whether the group is complete).
 *
 * @param {Array} groups   - groups from /api/groups (used for group structure + team membership)
 * @param {Array} matches  - games from /api/matches
 * @returns {Array} groups with computed standings, fully sorted (incl. head-to-head)
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
        mp: 0, played: 0, w: 0, d: 0, l: 0,
        gf: 0, ga: 0, gd: 0, pts: 0,
        isLive: false,
      };
    }
  }

  // Match records used for the head-to-head tiebreaker
  const matchRecords = [];

  // Process all group matches (finished + live)
  for (const m of matches ?? []) {
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

    matchRecords.push({ group: m.group, homeId, awayId, homeScore, awayScore });

    // Matches played — mp is provisional (counts live), played counts finished only
    home.mp += 1;
    away.mp += 1;
    if (!isLive) {
      home.played += 1;
      away.played += 1;
    }

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

  const fpp = computeFairPlayPoints(matches);

  // Build result groups with fully-sorted standings (overall + head-to-head)
  return groups.map((group) => ({
    ...group,
    teams: sortStandings(Object.values(standingsMap[group.name]), matchRecords, fpp),
  }));
}
