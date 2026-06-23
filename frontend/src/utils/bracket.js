/**
 * Bracket tree structure.
 * Each round is a list of pairGroups; each pairGroup is an ordered list of
 * match IDs whose bracket positions map 1:1 to slots in the next round.
 * Order within each round is top-to-bottom so slot heights align naturally.
 */
export const BRACKET_ROUNDS = [
  {
    id: 'r32',
    label: 'R32',
    slotMult: 1,   // slot height = BASE * slotMult
    pairGroups: [
      ['74', '77'], // → R16-89
      ['73', '75'], // → R16-90
      ['83', '84'], // → R16-93
      ['81', '82'], // → R16-94
      ['76', '78'], // → R16-91
      ['79', '80'], // → R16-92
      ['86', '88'], // → R16-95
      ['85', '87'], // → R16-96
    ],
  },
  {
    id: 'r16',
    label: 'R16',
    slotMult: 2,
    pairGroups: [
      ['89', '90'], // → QF-97
      ['93', '94'], // → QF-98
      ['91', '92'], // → QF-99
      ['95', '96'], // → QF-100
    ],
  },
  {
    id: 'qf',
    label: 'Quartas',
    slotMult: 4,
    pairGroups: [
      ['97', '98'],   // → SF-101
      ['99', '100'],  // → SF-102
    ],
  },
  {
    id: 'sf',
    label: 'Semifinal',
    slotMult: 8,
    pairGroups: [
      ['101', '102'], // → Final-104
    ],
  },
  {
    id: 'final',
    label: 'Final',
    slotMult: 16,
    pairGroups: [
      ['104'],
    ],
  },
];

export const THIRD_PLACE_ID = '103';

// ---------------------------------------------------------------------------
// Team resolution
// ---------------------------------------------------------------------------

function sortGroupTeams(teams) {
  return [...teams].sort((a, b) => {
    if (+b.pts !== +a.pts) return +b.pts - +a.pts;
    if (+b.gd !== +a.gd) return +b.gd - +a.gd;
    return +b.gf - +a.gf;
  });
}

/**
 * Resolve a slot (teamId + label from the API) to { team, projected }.
 * - team       : team object from teamMap, or null if unknown
 * - projected  : true when the result is based on current standings (not confirmed)
 */
export function resolveSlot(teamId, label, gameMap, groupMap, teamMap, depth = 0) {
  if (depth > 5) return { team: null, projected: false, group: null };

  // API already assigned a real team
  if (teamId && teamId !== '0') {
    const team = teamMap[teamId] ?? null;
    const group = team?.groups?.[0] ?? null;
    return { team, projected: false, group };
  }

  if (!label) return { team: null, projected: false, group: null };

  // "Winner Group X"
  const wg = label.match(/^Winner Group ([A-L])$/);
  if (wg) {
    const group = groupMap[wg[1]];
    if (!group) return { team: null, projected: false, group: wg[1] };
    const sorted = sortGroupTeams(group.teams);
    return { team: teamMap[sorted[0]?.team_id] ?? null, projected: true, group: wg[1] };
  }

  // "Runner-up Group X"
  const rug = label.match(/^Runner-up Group ([A-L])$/);
  if (rug) {
    const group = groupMap[rug[1]];
    if (!group) return { team: null, projected: false, group: rug[1] };
    const sorted = sortGroupTeams(group.teams);
    return { team: teamMap[sorted[1]?.team_id] ?? null, projected: true, group: rug[1] };
  }

  // "Winner Match N"
  const wm = label.match(/^Winner Match (\d+)$/);
  if (wm) {
    const game = gameMap[wm[1]];
    if (!game) return { team: null, projected: false, group: null };
    if (game.finished === 'TRUE') {
      const winnerId =
        +game.home_score > +game.away_score ? game.home_team_id : game.away_team_id;
      const team = teamMap[winnerId] ?? null;
      return { team, projected: false, group: team?.groups?.[0] ?? null };
    }
    // Recurse to collect source groups from both sides
    const homeR = resolveSlot(game.home_team_id, game.home_team_label, gameMap, groupMap, teamMap, depth + 1);
    const awayR = resolveSlot(game.away_team_id, game.away_team_label, gameMap, groupMap, teamMap, depth + 1);
    const unique = [...new Set([homeR.group, awayR.group].filter(Boolean))];
    return { team: null, projected: true, group: unique.length ? unique.join('/') : null };
  }

  // "Loser Match N" (3rd-place match)
  const lm = label.match(/^Loser Match (\d+)$/);
  if (lm) {
    const game = gameMap[lm[1]];
    if (!game) return { team: null, projected: false, group: null };
    if (game.finished === 'TRUE') {
      const loserId =
        +game.home_score <= +game.away_score ? game.home_team_id : game.away_team_id;
      const team = teamMap[loserId] ?? null;
      return { team, projected: false, group: team?.groups?.[0] ?? null };
    }
    const homeR = resolveSlot(game.home_team_id, game.home_team_label, gameMap, groupMap, teamMap, depth + 1);
    const awayR = resolveSlot(game.away_team_id, game.away_team_label, gameMap, groupMap, teamMap, depth + 1);
    const unique = [...new Set([homeR.group, awayR.group].filter(Boolean))];
    return { team: null, projected: true, group: unique.length ? unique.join('/') : null };
  }

  // "3rd Group A/B/…" – show candidate groups as badge
  const tg = label.match(/^3rd Group (.+)$/);
  if (tg) {
    return { team: null, projected: true, group: tg[1] };
  }

  return { team: null, projected: false, group: null };
}

/** Shorten long bracket labels to fit compact cards */
export function shortLabel(label) {
  if (!label) return '?';
  if (label.startsWith('3rd Group')) return '3º Lugar';
  if (label.startsWith('Winner Match')) return `W${label.slice(13)}`;
  if (label.startsWith('Loser Match')) return `L${label.slice(12)}`;
  if (label.startsWith('Winner Group')) return `1º ${label.slice(13)}`;
  if (label.startsWith('Runner-up Group')) return `2º ${label.slice(16)}`;
  return label.slice(0, 10);
}
