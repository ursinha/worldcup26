// Stadium ID → IANA timezone (based on region + country from /api/stadiums)
// Eastern US/Canada → America/New_York
// Central US       → America/Chicago  (CDT = UTC-5 in summer)
// Central Mexico   → America/Mexico_City (no DST since 2022, CST = UTC-6)
// Western US/Canada→ America/Los_Angeles (PDT = UTC-7 in summer)
const STADIUM_TZ = {
  '1': 'America/Mexico_City',  // Estadio Azteca, Mexico City
  '2': 'America/Mexico_City',  // Estadio Akron, Guadalajara
  '3': 'America/Mexico_City',  // Estadio BBVA, Monterrey
  '4': 'America/Chicago',      // AT&T Stadium, Dallas
  '5': 'America/Chicago',      // NRG Stadium, Houston
  '6': 'America/Chicago',      // Arrowhead Stadium, Kansas City
  '7': 'America/New_York',     // Mercedes-Benz Stadium, Atlanta
  '8': 'America/New_York',     // Hard Rock Stadium, Miami
  '9': 'America/New_York',     // Gillette Stadium, Boston
  '10': 'America/New_York',    // Lincoln Financial Field, Philadelphia
  '11': 'America/New_York',    // MetLife Stadium, New York/NJ
  '12': 'America/Toronto',     // BMO Field, Toronto
  '13': 'America/Vancouver',   // BC Place, Vancouver
  '14': 'America/Los_Angeles', // Lumen Field, Seattle
  '15': 'America/Los_Angeles', // Levi's Stadium, San Francisco
  '16': 'America/Los_Angeles', // SoFi Stadium, Los Angeles
};

const BRT = 'America/Sao_Paulo';

/**
 * Parse a "MM/DD/YYYY HH:MM" local time string in the given timezone to a UTC Date.
 * Uses the Intl "guess-and-correct" trick — no external libraries.
 */
export function parseLocalDate(localDateStr, timezone) {
  if (!localDateStr) return null;
  const [datePart, timePart] = localDateStr.split(' ');
  if (!datePart || !timePart) return null;
  const [mm, dd, yyyy] = datePart.split('/');
  const [hh, min] = timePart.split(':');

  // Step 1: treat the values as UTC to get a naive Date
  const naive = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +min));

  // Step 2: ask Intl what clock shows for this UTC instant in the target TZ
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(naive);

  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const tzApparent = new Date(
    Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === '24' ? 0 : +p.hour, +p.minute)
  );

  // Step 3: the offset is naive − tzApparent
  const offsetMs = naive.getTime() - tzApparent.getTime();

  // Step 4: actual UTC = naive + offset
  return new Date(naive.getTime() + offsetMs);
}

/**
 * Convert a game's local_date + stadium_id to a UTC Date.
 */
export function gameToUTC(localDateStr, stadiumId) {
  const tz = STADIUM_TZ[String(stadiumId)] ?? 'America/New_York';
  return parseLocalDate(localDateStr, tz);
}

/**
 * Format a UTC Date in Brasília time (America/Sao_Paulo).
 * Returns { date, time, weekday } strings in Brazilian locale.
 */
export function formatBRT(date) {
  if (!date || isNaN(date)) return { date: '—', time: '—', weekday: '—', isoDate: '' };

  const dateFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRT,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const timeFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRT,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const weekdayFmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRT,
    weekday: 'long',
  });

  // ISO date string in BRT for grouping (YYYY-MM-DD)
  const iso = new Intl.DateTimeFormat('sv-SE', {
    timeZone: BRT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

  return {
    date: dateFmt.format(date),
    time: timeFmt.format(date),
    weekday: weekdayFmt.format(date),
    isoDate: iso,
  };
}

/**
 * Today's date string in BRT (YYYY-MM-DD).
 */
export function todayBRT() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BRT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Format a UTC ISO timestamp as a short BRT time for the status bar.
 */
export function formatStatusTime(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRT,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}
