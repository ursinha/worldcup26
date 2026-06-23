/**
 * Parse the scorer string from the API.
 * Formats seen: "null", '{"Name 45\'","Name 67\'"}', '{\"Name 45\'\",\"Name 67\'\"}'
 */
export function parseScorers(raw) {
  if (!raw || raw === 'null') return [];
  // Extract all quoted strings from within the curly-brace wrapper
  const matches = [...raw.matchAll(/"([^"]+)"/g)];
  return matches.map((m) => m[1]);
}

/**
 * Determine match status from API fields.
 * Returns: 'finished' | 'live' | 'notstarted'
 */
export function matchStatus(game) {
  if (game.finished === 'TRUE') return 'finished';
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
    round_of_32: 'Oitavas de Final (R32)',
    round_of_16: 'Oitavas de Final',
    quarter_finals: 'Quartas de Final',
    semi_finals: 'Semifinal',
    third_place: 'Disputa de 3º Lugar',
    final: 'Final',
  };
  return labels[game.type] ?? game.type ?? '—';
}
