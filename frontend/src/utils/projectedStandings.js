import { matchStatus } from './parsers';
import { computeFairPlayPoints, compareThird } from './thirdPlace';

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
 * Mathematical clinch / elimination for a single group, computed from match
 * results only — independent of the upstream feed's projections.
 *
 * Brute-forces every combination of the group's remaining results (a 4-team
 * group has at most 6 matches, so ≤ 3^6 = 729 cases) and tracks, for each
 * team, the worst and best number of rivals that can finish ahead of it.
 * Ties are handled conservatively (resolved *against* the team when checking a
 * clinch, *for* the team when checking elimination) so we never claim a result
 * the goal-difference tiebreaker could still overturn.
 *
 * Returns per team:
 *   - clinchedWinner : guaranteed to finish 1st (group winner) regardless of remaining results
 *   - qualified      : guaranteed a top-2 finish → guaranteed to advance
 *   - eliminated     : cannot finish in the top 3 → no path to the knockouts
 *                      (only 3rd-placed teams can grab a best-third spot, so a
 *                      team stuck in last is mathematically out)
 *   - guaranteedTop3 : can never finish below 3rd (so always a third-or-better)
 *   - canTop2        : still has a scenario that ends in the top 2
 *   - minPts/maxPts  : floor/ceiling of the team's final points
 *
 * Also returns group-level `thirdFloor`/`thirdCeil`: the min/max points the
 * 3rd-placed team of this group can finish with, used by the cross-group
 * best-third analysis (see applyBestThird).
 */
export function computeClinch(sortedTeams, groupMatches) {
  const ids = sortedTeams.map((t) => t.team_id);
  const matches = groupMatches ?? [];
  const pending = matches.filter((m) => matchStatus(m) !== 'finished');

  // Base points from finished matches + count each team's remaining games
  const basePts = Object.fromEntries(ids.map((id) => [id, 0]));
  const pendCount = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const m of matches) {
    if (basePts[m.home_team_id] === undefined || basePts[m.away_team_id] === undefined) continue;
    if (matchStatus(m) === 'finished') {
      const hs = +m.home_score || 0;
      const as = +m.away_score || 0;
      if (hs > as) basePts[m.home_team_id] += 3;
      else if (hs < as) basePts[m.away_team_id] += 3;
      else { basePts[m.home_team_id] += 1; basePts[m.away_team_id] += 1; }
    } else {
      pendCount[m.home_team_id] += 1;
      pendCount[m.away_team_id] += 1;
    }
  }
  const minPts = { ...basePts };
  const maxPts = Object.fromEntries(ids.map((id) => [id, basePts[id] + 3 * pendCount[id]]));

  // Group already decided — positions are final, use the real standings order
  if (pending.length === 0) {
    const last = sortedTeams.length - 1;
    const thirdPts = +(sortedTeams[2]?.pts ?? 0);
    return {
      teams: Object.fromEntries(sortedTeams.map((t, i) => [t.team_id, {
        clinchedWinner: i === 0,
        qualified: i <= 1,
        eliminated: i === last,
        guaranteedTop3: i <= 2,
        canTop2: i <= 1,
        minPts: +t.pts, maxPts: +t.pts,
      }])),
      thirdFloor: thirdPts, thirdCeil: thirdPts,
      complete: true,
    };
  }

  const combos = 3 ** pending.length;
  if (combos > 6561) { // safety valve; never expected for a 4-team group
    return {
      teams: Object.fromEntries(ids.map((id) => [id, {
        clinchedWinner: false, qualified: false, eliminated: false,
        guaranteedTop3: false, canTop2: true, minPts: minPts[id], maxPts: maxPts[id],
      }])),
      thirdFloor: 0, thirdCeil: Infinity,
      complete: false,
    };
  }

  const maxGeq = Object.fromEntries(ids.map((id) => [id, 0]));        // most rivals finishing ≥ this team
  const minGreater = Object.fromEntries(ids.map((id) => [id, Infinity])); // fewest rivals finishing strictly ahead
  let thirdFloor = Infinity, thirdCeil = -Infinity;

  for (let c = 0; c < combos; c++) {
    const pts = { ...basePts };
    let x = c;
    for (const m of pending) {
      const r = x % 3; x = (x - r) / 3;
      if (r === 0) pts[m.home_team_id] += 3;
      else if (r === 1) { pts[m.home_team_id] += 1; pts[m.away_team_id] += 1; }
      else pts[m.away_team_id] += 3;
    }
    for (const id of ids) {
      let greater = 0, geq = 0;
      for (const other of ids) {
        if (other === id) continue;
        if (pts[other] > pts[id]) { greater++; geq++; }
        else if (pts[other] === pts[id]) geq++;
      }
      if (geq > maxGeq[id]) maxGeq[id] = geq;
      if (greater < minGreater[id]) minGreater[id] = greater;
    }
    // points of the 3rd-placed team in this scenario (3rd highest)
    const third = ids.map((id) => pts[id]).sort((a, b) => b - a)[2] ?? 0;
    if (third < thirdFloor) thirdFloor = third;
    if (third > thirdCeil) thirdCeil = third;
  }

  return {
    teams: Object.fromEntries(ids.map((id) => [id, {
      clinchedWinner: maxGeq[id] === 0,
      qualified: maxGeq[id] <= 1,
      eliminated: minGreater[id] >= 3,
      guaranteedTop3: maxGeq[id] <= 2,
      canTop2: minGreater[id] <= 1,
      minPts: minPts[id], maxPts: maxPts[id],
    }])),
    thirdFloor, thirdCeil,
    complete: false,
  };
}

/**
 * Cross-group best-third clinch / elimination. 12 third-placed teams compete
 * for 8 knockout spots; this folds that into each team's qualified/eliminated
 * status, soundly (never overclaiming).
 *
 * For a candidate team T in group b, count the other groups whose 3rd-placed
 * team is ahead of T — separately as *possible* and *guaranteed*:
 *   - When both T's group and the other group are finished, their figures are
 *     fixed, so the full FIFA best-third key (pts → GD → GF → fair play, via
 *     compareThird) decides; a strict win counts as guaranteed+possible, a
 *     strict loss as neither, an exact dead-heat (drawing of lots) as possible
 *     only.
 *   - Otherwise a not-yet-played game leaves goal difference free, so we fall
 *     back to point bounds: guaranteed-ahead needs strictly more points than
 *     T can reach; possible-ahead needs at least T's points floor.
 *
 * T clinches a knockout spot (as a third) when it can never finish below 3rd
 * AND at most 7 other thirds could possibly be ahead of it. T is eliminated
 * when it can't reach the top 2 AND at least 8 other thirds are guaranteed
 * ahead of it. The verdict is never claimed where an unplayed goal margin
 * could still overturn it.
 *
 * Only meaningful for the 12-group / 8-best-thirds format; skipped otherwise.
 */
export function applyBestThird(built, fpp = {}) {
  if (built.length !== 12) return;
  const QUALIFY = 8; // best thirds that advance

  const keyOf = (team) => ({
    pts: +team.pts, gd: +team.gd, gf: +team.gf, fpp: fpp[team.team_id] || 0,
  });

  for (const b of built) {
    const Tcomplete = b.clinch.complete;
    const Tthird = Tcomplete ? b.sorted[2] : null; // the (only) third of a finished group

    for (const id of Object.keys(b.clinch.teams)) {
      const T = b.clinch.teams[id];
      if (T.qualified || T.eliminated) continue;          // already settled by its group
      if (Tcomplete && Tthird?.team_id !== id) continue;  // a finished group's third is its only candidate
      const Tkey = Tcomplete ? keyOf(Tthird) : null;

      let aheadPossible = 0, aheadGuaranteed = 0;
      for (const g of built) {
        if (g === b) continue;

        if (g.clinch.complete) {
          const Kg = keyOf(g.sorted[2]);
          if (Tcomplete) {
            const cmp = compareThird(Kg, Tkey); // < 0 ⇒ g's third ahead of T
            if (cmp < 0) { aheadGuaranteed += 1; aheadPossible += 1; }
            else if (cmp === 0) aheadPossible += 1; // dead heat → drawing of lots
          } else {
            // T's GD still free: compare fixed rival points against T's bounds
            if (Kg.pts > T.maxPts) aheadGuaranteed += 1;
            if (Kg.pts >= T.minPts) aheadPossible += 1;
          }
        } else {
          // rival's third still has a game to play → goal difference is free
          if (g.clinch.thirdFloor > T.maxPts) aheadGuaranteed += 1;
          if (g.clinch.thirdCeil >= T.minPts) aheadPossible += 1;
        }
      }

      if (T.guaranteedTop3 && aheadPossible <= QUALIFY - 1) {
        T.qualified = true;
        T.advancedAsThird = true;
      } else if (!T.canTop2 && aheadGuaranteed >= QUALIFY) {
        T.eliminated = true;
      }
    }
  }
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
  const allMatches = matches ?? [];

  // First pass: fully-sorted standings (overall + head-to-head) and the
  // group-local clinch/elimination status for each team.
  const built = groups.map((group) => {
    const sorted = sortStandings(Object.values(standingsMap[group.name]), matchRecords, fpp);
    const groupMatches = allMatches.filter((m) => m.type === 'group' && m.group === group.name);
    return { group, sorted, clinch: computeClinch(sorted, groupMatches) };
  });

  // Second pass: cross-group best-third clinch/elimination folds into qualified/eliminated.
  applyBestThird(built, fpp);

  return built.map(({ group, sorted, clinch }) => ({
    ...group,
    teams: sorted.map((t) => {
      const c = clinch.teams[t.team_id];
      return {
        ...t,
        clinchedWinner: c.clinchedWinner,
        qualified: c.qualified,
        eliminated: c.eliminated,
        advancedAsThird: !!c.advancedAsThird,
      };
    }),
  }));
}
