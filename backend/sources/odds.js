/**
 * The Odds API source — fetches Over/Under totals for upcoming World Cup matches.
 * The O/U line is passed to predictMatch() to calibrate λ against bookmaker
 * expectations rather than relying solely on tournament attack/defense ratings.
 *
 * Requires ODDS_API_KEY env var. Degrades gracefully (no-op) when absent.
 */

const API_KEY  = process.env.ODDS_API_KEY;
const SPORT    = 'soccer_fifa_world_cup';
const BASE_URL = 'https://api.the-odds-api.com/v4';

export const id        = 'odds';
export const intervals = { idle: 6 * 60 * 60_000 }; // poll every 6 hours

// The Odds API may use different team names than our primary source
const NAME_ALIASES = {
  'usa':                             'united states',
  'south korea':                     'korea republic',
  'republic of korea':               'korea republic',
  'ivory coast':                     "côte d'ivoire",
  'cote d\'ivoire':                  "côte d'ivoire",
  'czechia':                         'czech republic',
  'czech republic':                  'czech republic',
  'turkey':                          'turkey',
  'türkiye':                         'turkey',
  'bosnia-herzegovina':              'bosnia and herzegovina',
  'dr congo':                        'democratic republic of the congo',
  'congo dr':                        'democratic republic of the congo',
  'democratic republic of congo':    'democratic republic of the congo',
};

function normalize(name) {
  const n = (name ?? '').toLowerCase().trim();
  return NAME_ALIASES[n] ?? n;
}

/**
 * Fetch O/U totals from The Odds API.
 * Returns raw API response array.
 */
export async function fetchOdds() {
  if (!API_KEY) throw new Error('ODDS_API_KEY not configured');
  const url = `${BASE_URL}/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=eu,uk&markets=totals&oddsFormat=decimal`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Odds API ${res.status}: ${body}`);
  }
  const remaining = res.headers.get('x-requests-remaining');
  if (remaining !== null) console.log(`[odds] requests remaining: ${remaining}`);
  return res.json();
}

/**
 * Match Odds API events to our internal matches and extract the median O/U line.
 * Returns array of { id, ou_line } rows ready for DB upsert.
 */
export function extractOdds(rawData, currentMatches) {
  const rows = [];

  for (const event of rawData) {
    const homeNorm = normalize(event.home_team);
    const awayNorm = normalize(event.away_team);

    const match = currentMatches.find(g =>
      normalize(g.home_team_name_en) === homeNorm &&
      normalize(g.away_team_name_en) === awayNorm &&
      g.finished === 'FALSE',
    );

    if (!match) continue;

    // Collect O/U lines from all bookmakers and take the median
    const lines = [];
    for (const bk of event.bookmakers ?? []) {
      const totalsMarket = (bk.markets ?? []).find(m => m.key === 'totals');
      if (!totalsMarket) continue;
      const over = totalsMarket.outcomes?.find(o => o.name === 'Over');
      if (over?.point != null) lines.push(over.point);
    }

    if (!lines.length) continue;

    lines.sort((a, b) => a - b);
    const median = lines[Math.floor(lines.length / 2)];
    rows.push({ id: match.id, ou_line: median });
  }

  return rows;
}
