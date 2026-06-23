const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

export const id = 'live';
export const intervals = { live: 15 * 60_000, idle: null };

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
  if (name === 'STATUS_FULL_TIME')   return 'FT';
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

// date: optional 'YYYYMMDD' string for historical queries
export async function fetchData(date = null) {
  const url = date ? `${SCOREBOARD_URL}?dates=${date}` : SCOREBOARD_URL;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Accepts both live ('in') and finished ('post') events
export function extractUpdates(rawData, currentMatches) {
  const now = Date.now();
  const updates = [];

  for (const event of rawData.events ?? []) {
    const comp   = event.competitions?.[0];
    const status = event.status;
    const state  = status?.type?.state;
    if (!comp || (state !== 'in' && state !== 'post')) continue;

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
    const isPost = state === 'post';

    updates.push({
      id:            match.id,
      // don't store clock for finished matches — it's not used for display
      clock:         isPost ? null : (status.displayClock ?? null),
      clock_seconds: isPost ? null : (typeof status.clock === 'number' ? status.clock : null),
      period:        mapPeriod(status.type),
      events:        JSON.stringify(events),
      enriched_at:   now,
    });
  }

  return updates;
}

// Convert "MM/DD/YYYY HH:mm" → "YYYYMMDD" for ESPN date param
export function toESPNDate(localDate) {
  if (!localDate) return null;
  const [datePart] = localDate.split(' ');
  const [mm, dd, yyyy] = datePart.split('/');
  return `${yyyy}${mm}${dd}`;
}
