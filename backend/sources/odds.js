/**
 * The Odds API source — fetches O/U totals and h2h win probabilities.
 *
 * Both markets are fetched in a single API call:
 *  - totals  → O/U line, used to calibrate expected total goals (λ_h + λ_a)
 *  - h2h     → win/draw/lose probabilities, used to calibrate the λ split
 *              between teams AND as the displayed outcome percentages
 *
 * Requires ODDS_API_KEY env var. Degrades gracefully when absent.
 */

const API_KEY  = process.env.ODDS_API_KEY;
const SPORT    = 'soccer_fifa_world_cup';
const BASE_URL = 'https://api.the-odds-api.com/v4';

export const id        = 'odds';
export const intervals = { idle: 6 * 60 * 60_000 }; // poll every 6 hours

const NAME_ALIASES = {
  'usa':                           'united states',
  'south korea':                   'korea republic',
  'republic of korea':             'korea republic',
  'ivory coast':                   "côte d'ivoire",
  "cote d'ivoire":                 "côte d'ivoire",
  'czechia':                       'czech republic',
  'turkey':                        'turkey',
  'türkiye':                       'turkey',
  'bosnia-herzegovina':            'bosnia and herzegovina',
  'dr congo':                      'democratic republic of the congo',
  'congo dr':                      'democratic republic of the congo',
  'democratic republic of congo':  'democratic republic of the congo',
};

function normalize(name) {
  const n = (name ?? '').toLowerCase().trim();
  return NAME_ALIASES[n] ?? n;
}

function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }

/**
 * Fetch h2h + totals odds from The Odds API in one request.
 */
export async function fetchOdds() {
  if (!API_KEY) throw new Error('ODDS_API_KEY not configured');
  const url = `${BASE_URL}/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=eu,uk&markets=totals,h2h&oddsFormat=decimal`;
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
 * Match Odds API events to our internal matches and extract:
 *  - ou_line   : median O/U total goals line across bookmakers
 *  - h2h_home  : bookmaker-consensus home win probability (%)
 *  - h2h_draw  : bookmaker-consensus draw probability (%)
 *  - h2h_away  : bookmaker-consensus away win probability (%)
 *
 * Returns rows ready for DB upsert.
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

    const ouLines  = [];
    const h2hHomes = [], h2hDraws = [], h2hAways = [];

    for (const bk of event.bookmakers ?? []) {
      // --- totals ---
      const totals = (bk.markets ?? []).find(m => m.key === 'totals');
      if (totals) {
        const over = totals.outcomes?.find(o => o.name === 'Over');
        if (over?.point != null) ouLines.push(over.point);
      }

      // --- h2h ---
      const h2h = (bk.markets ?? []).find(m => m.key === 'h2h');
      if (h2h) {
        // The Odds API uses the team name for home/away outcomes
        const homeO = h2h.outcomes?.find(o => o.name === event.home_team);
        const drawO = h2h.outcomes?.find(o => o.name === 'Draw');
        const awayO = h2h.outcomes?.find(o => o.name === event.away_team);
        if (homeO?.price && drawO?.price && awayO?.price) {
          // Convert decimal odds → implied probability, then remove bookmaker margin
          const iH = 1 / homeO.price;
          const iD = 1 / drawO.price;
          const iA = 1 / awayO.price;
          const total = iH + iD + iA;
          h2hHomes.push(iH / total);
          h2hDraws.push(iD / total);
          h2hAways.push(iA / total);
        }
      }
    }

    const row = { id: match.id, ou_line: null, h2h_home: null, h2h_draw: null, h2h_away: null };

    if (ouLines.length) {
      ouLines.sort((a, b) => a - b);
      row.ou_line = ouLines[Math.floor(ouLines.length / 2)];
    }

    if (h2hHomes.length) {
      // Average across bookmakers, store as percentages (1 decimal)
      row.h2h_home = Math.round(avg(h2hHomes) * 1000) / 10;
      row.h2h_draw = Math.round(avg(h2hDraws) * 1000) / 10;
      row.h2h_away = Math.round(avg(h2hAways) * 1000) / 10;
    }

    if (row.ou_line !== null || row.h2h_home !== null) rows.push(row);
  }

  return rows;
}
