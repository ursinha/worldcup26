/**
 * Parse the scorer string from the API.
 * Formats seen: "null", '{"Name 45\'","Name 67\'"}', '{\"Name 45\'\",\"Name 67\'\"}'
 */
export function parseScorers(raw) {
  if (!raw || raw === 'null') return [];
  // Strip the curly-brace wrapper, split on commas, and trim the surrounding
  // double quotes — the feed mixes straight (") and smart (“ ”) quotes, and
  // uses the literal string "null" for a side with no scorers.
  return raw
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^["“”]+|["“”]+$/g, '').trim())
    .filter((s) => s && s.toLowerCase() !== 'null');
}

/**
 * Build per-side scorer lists from ESPN goal events (the live source) — the
 * single source of truth for live scores/scorers. Each entry is "Player 45'".
 * Own goals are credited to the opposite side with a "(GC)" marker; penalty
 * shootout goals are excluded (they aren't match goals).
 *
 * @param {Array} events - parsed events from the match (`game.events`)
 * @returns {{home: string[], away: string[]}}
 */
export function scorersFromEvents(events) {
  const home = [];
  const away = [];
  for (const e of events ?? []) {
    if (e.shootout) continue;
    const label = `${e.player ?? '?'} ${e.minute ?? ''}`.trim();
    if (e.type === 'goal') {
      (e.team === 'home' ? home : away).push(label);
    } else if (e.type === 'own_goal') {
      // an own goal counts for the opposing side
      (e.team === 'home' ? away : home).push(`${label} (GC)`);
    }
  }
  return { home, away };
}

/**
 * Determine match status from API fields.
 * Returns: 'finished' | 'live' | 'notstarted'
 */
export function matchStatus(game) {
  if (game.finished === 'TRUE' || game.period === 'FT') return 'finished';
  if (game.time_elapsed === 'notstarted') return 'notstarted';
  return 'live';
}

/**
 * Human-readable stage label from type + group fields.
 */
export function stageLabel(game) {
  if (game.type === 'group') {
    return `Grupo ${game.group} · MD${game.matchday}`;
  }
  const labels = {
    r32: '16 Avos de Final',
    r16: 'Oitavas de Final',
    qf: 'Quartas de Final',
    sf: 'Semifinal',
    third: 'Disputa de 3º Lugar',
    final: 'Final',
  };
  return labels[game.type] ?? game.type ?? '—';
}
