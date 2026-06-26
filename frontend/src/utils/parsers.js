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
    r32: 'Oitavas de Final (R32)',
    r16: 'Oitavas de Final',
    qf: 'Quartas de Final',
    sf: 'Semifinal',
    third: 'Disputa de 3º Lugar',
    final: 'Final',
  };
  return labels[game.type] ?? game.type ?? '—';
}
