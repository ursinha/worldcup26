/**
 * pt-BR localization for team names and knockout placeholder labels.
 *
 * The upstream feed only supplies English (`name_en`) and Farsi (`name_fa`),
 * so we keep a static dictionary keyed by the English name. Both the teams
 * table and the match objects expose `name_en`, so one map covers every site.
 */

// name_en → pt-BR (all 48 teams of the 2026 World Cup)
export const PT_TEAMS = {
  'Algeria': 'Argélia',
  'Argentina': 'Argentina',
  'Australia': 'Austrália',
  'Austria': 'Áustria',
  'Belgium': 'Bélgica',
  'Bosnia and Herzegovina': 'Bósnia e Herzegovina',
  'Brazil': 'Brasil',
  'Canada': 'Canadá',
  'Cape Verde': 'Cabo Verde',
  'Colombia': 'Colômbia',
  'Croatia': 'Croácia',
  'Curaçao': 'Curaçao',
  'Czech Republic': 'República Tcheca',
  'Democratic Republic of the Congo': 'República Democrática do Congo',
  'Ecuador': 'Equador',
  'Egypt': 'Egito',
  'England': 'Inglaterra',
  'France': 'França',
  'Germany': 'Alemanha',
  'Ghana': 'Gana',
  'Haiti': 'Haiti',
  'Iran': 'Irã',
  'Iraq': 'Iraque',
  'Ivory Coast': 'Costa do Marfim',
  'Japan': 'Japão',
  'Jordan': 'Jordânia',
  'Mexico': 'México',
  'Morocco': 'Marrocos',
  'Netherlands': 'Holanda',
  'New Zealand': 'Nova Zelândia',
  'Norway': 'Noruega',
  'Panama': 'Panamá',
  'Paraguay': 'Paraguai',
  'Portugal': 'Portugal',
  'Qatar': 'Qatar',
  'Saudi Arabia': 'Arábia Saudita',
  'Scotland': 'Escócia',
  'Senegal': 'Senegal',
  'South Africa': 'África do Sul',
  'South Korea': 'Coreia do Sul',
  'Spain': 'Espanha',
  'Sweden': 'Suécia',
  'Switzerland': 'Suíça',
  'Tunisia': 'Tunísia',
  'Turkey': 'Turquia',
  'United States': 'Estados Unidos',
  'Uruguay': 'Uruguai',
  'Uzbekistan': 'Uzbequistão',
};

/**
 * Localize a team's English name to pt-BR. Returns `undefined` for an empty
 * input so existing `?? \`ID …\`` / label fallbacks keep working; unknown names
 * pass through unchanged.
 */
export function teamNamePt(nameEn) {
  if (!nameEn) return undefined;
  return PT_TEAMS[nameEn] ?? nameEn;
}

/**
 * Localize a knockout placeholder label (used when a slot's team isn't decided).
 * Falls back to the original string for anything unrecognized.
 */
export function matchLabelPt(label) {
  if (!label) return label;

  let m = label.match(/^Winner Group ([A-L])$/);
  if (m) return `Vencedor do Grupo ${m[1]}`;

  m = label.match(/^Runner-up Group ([A-L])$/);
  if (m) return `Vice do Grupo ${m[1]}`;

  m = label.match(/^3rd Group (.+)$/);
  if (m) return `3º dos Grupos ${m[1]}`;

  m = label.match(/^Winner Match (\d+)$/);
  if (m) return `Vencedor do Jogo ${m[1]}`;

  m = label.match(/^Loser Match (\d+)$/);
  if (m) return `Perdedor do Jogo ${m[1]}`;

  return label;
}
