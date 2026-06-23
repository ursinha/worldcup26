const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

export const id = 'live';
export const intervals = { live: 15 * 60_000, idle: null }; // only poll when live

function normalize(name) {
  return (name ?? '').toLowerCase().trim();
}

function mapPeriod(statusType) {
  const name = statusType?.name ?? '';
  if (name === 'STATUS_HALFTIME')    return 'HT';
  if (name === 'STATUS_FIRST_HALF')  return '1';
  if (name === 'STATUS_SECOND_HALF') return '2';
  if (name.includes('EXTRA_TIME'))   return 'ET';
  if (name.includes('PENALTY'))      return 'PEN';
  return null;
}

function mapDetail(detail, homeId, awayId) {
  const team   = detail.team?.id === homeId ? 'home' : 'away';
  const player = detail.athletesInvolved?.[0]?.displayName ?? null;
  const minute = detail.clock?.displayValue ?? null;

  if (detail.yellowCard)  return { type: 'yellow_card', minute, player, team };
  if (detail.redCard)     return { type: 'red_card',    minute, player, team };
  if (detail.ownGoal)     return { type: 'own_goal',    minute, player, team };
  if (detail.scoringPlay) {
    const subtype = detail.penaltyKick ? 'penalty'
      : (detail.type?.text ?? '').toLowerCase().includes('free') ? 'free_kick'
      : null;
    return { type: 'goal', minute, player, team, subtype };
  }
  return null;
}

export async function fetchData() {
  const res = await fetch(SCOREBOARD_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function extractUpdates(rawData, currentMatches) {
  const now = Date.now();
  const updates = [];

  for (const event of rawData.events ?? []) {
    const comp   = event.competitions?.[0];
    const status = event.status;
    if (!comp || status?.type?.state !== 'in') continue;

    const homeComp = comp.competitors?.find(c => c.homeAway === 'home');
    const awayComp = comp.competitors?.find(c => c.homeAway === 'away');
    if (!homeComp || !awayComp) continue;

    const match = currentMatches.find(m =>
      normalize(m.home_team_name_en) === normalize(homeComp.team?.displayName) &&
      normalize(m.away_team_name_en) === normalize(awayComp.team?.displayName),
    );

    if (!match) {
      console.warn(`[${id}] no match found: ${homeComp.team?.displayName} vs ${awayComp.team?.displayName}`);
      continue;
    }

    const homeId = homeComp.team?.id;
    const awayId = awayComp.team?.id;
    const events = (comp.details ?? []).map(d => mapDetail(d, homeId, awayId)).filter(Boolean);

    updates.push({
      id:            match.id,
      clock:         status.displayClock ?? null,
      clock_seconds: typeof status.clock === 'number' ? status.clock : null,
      period:        mapPeriod(status.type),
      events:        JSON.stringify(events),
      enriched_at:   now,
    });
  }

  return updates;
}
