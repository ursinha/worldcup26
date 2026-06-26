/**
 * 3rd-place ranking and bracket slot assignment.
 */

// ---------------------------------------------------------------------------
// Fair play points from match events
// ---------------------------------------------------------------------------

/**
 * FIFA fair play point deductions per card type:
 *   yellow card          = -1
 *   indirect red (2× yellow) = -3
 *   direct red           = -4
 *   yellow + direct red (same game) = -5
 *
 * Since we can't distinguish indirect vs direct red from the event data alone,
 * we treat all red_card events as direct reds (-4) and yellow_card as -1.
 * This is a simplification but matches the most common scoring approach
 * when detailed card subtypes aren't available.
 */
const CARD_POINTS = {
  yellow_card: -1,
  red_card: -4,
};

/**
 * Compute fair play points per team from group match events.
 *
 * @param {Array} matches - all matches from /api/matches
 * @returns {Object} { teamId: fairPlayPoints (negative = worse) }
 */
export function computeFairPlayPoints(matches) {
  const fpp = {};
  if (!matches?.length) return fpp;

  for (const match of matches) {
    if (match.type !== 'group') continue;
    if (!match.events?.length) continue;

    const teamIds = { home: match.home_team_id, away: match.away_team_id };

    for (const event of match.events) {
      const pts = CARD_POINTS[event.type];
      if (pts === undefined) continue;
      const teamId = teamIds[event.team];
      if (!teamId) continue;
      fpp[teamId] = (fpp[teamId] || 0) + pts;
    }
  }

  return fpp;
}

// ---------------------------------------------------------------------------
// 3rd-place ranking
// ---------------------------------------------------------------------------

/**
 * Extract and rank all 3rd-place teams from projected groups.
 *
 * FIFA tiebreakers for best third-placed teams:
 *   1. Points
 *   2. Goal difference
 *   3. Goals scored
 *   4. Fair play points (fewer deductions = better)
 *   5. Drawing of lots (cannot be implemented)
 *
 * @param {Array} groups  - projected groups (sorted standings)
 * @param {Array} matches - all matches from /api/matches (for fair play calculation)
 * @returns {Array} ranked 3rd-place entries with `qualifying` flag (top 8)
 */
export function rankThirdPlaceTeams(groups, matches) {
  if (!groups?.length) return [];

  const fpp = computeFairPlayPoints(matches);

  // Groups arrive already sorted (projectStandings) — 3rd place is index 2
  const thirds = [];
  for (const group of groups) {
    const third = group.teams[2];
    if (third) {
      thirds.push({
        ...third,
        group: group.name,
        fpp: fpp[third.team_id] || 0,
      });
    }
  }

  // Sort by FIFA best-3rd tiebreakers: pts → gd → gf → fair play (higher = better)
  thirds.sort((a, b) => {
    if (+b.pts !== +a.pts) return +b.pts - +a.pts;
    if (+b.gd !== +a.gd) return +b.gd - +a.gd;
    if (+b.gf !== +a.gf) return +b.gf - +a.gf;
    return b.fpp - a.fpp; // less negative = fewer cards = better
  });

  // Top 8 qualify, bottom 4 eliminated
  return thirds.map((t, i) => ({
    ...t,
    qualifying: i < 8,
  }));
}

// ---------------------------------------------------------------------------
// FIFA official 3rd-place bracket assignment (Annex C)
// ---------------------------------------------------------------------------

/**
 * Match IDs for R32 slots that receive a 3rd-place team.
 * The compact string values encode assignments in this order.
 */
const SLOT_MATCH_IDS = ['74', '77', '79', '80', '81', '82', '85', '87'];

/**
 * Official FIFA lookup table from Annex C of the FWC 2026 Regulations.
 * 495 combinations mapping 8 qualifying group letters (sorted, as key)
 * to a compact 8-char string where each character is the group letter
 * assigned to the corresponding SLOT_MATCH_IDS entry.
 *
 * Columns in the regulations (1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L) map to:
 *   1E → Match 74 (Winner Group E)
 *   1I → Match 77 (Winner Group I)
 *   1A → Match 79 (Winner Group A)
 *   1L → Match 80 (Winner Group L)
 *   1D → Match 81 (Winner Group D)
 *   1G → Match 82 (Winner Group G)
 *   1B → Match 85 (Winner Group B)
 *   1K → Match 87 (Winner Group K)
 */
const FIFA_ASSIGNMENT_TABLE = {
  'ABCDEFGH': 'CFHEBAGD',
  'ABCDEFGI': 'DFCIBAGE',
  'ABCDEFGJ': 'DFCJBAGE',
  'ABCDEFGK': 'DFCKBAGE',
  'ABCDEFGL': 'DFCEBAGL',
  'ABCDEFHI': 'CFHIBAED',
  'ABCDEFHJ': 'CFHEBAJD',
  'ABCDEFHK': 'CFHKBAED',
  'ABCDEFHL': 'CDHEBAFL',
  'ABCDEFIJ': 'DFCIBAJE',
  'ABCDEFIK': 'DFCKBAEI',
  'ABCDEFIL': 'DFCIBAEL',
  'ABCDEFJK': 'DFCKBAJE',
  'ABCDEFJL': 'DFCEBAJL',
  'ABCDEFKL': 'DFCKBAEL',
  'ABCDEGHI': 'CDHIBAGE',
  'ABCDEGHJ': 'CDHJBAGE',
  'ABCDEGHK': 'CDHKBAGE',
  'ABCDEGHL': 'CDHEBAGL',
  'ABCDEGIJ': 'CDEJBAGI',
  'ABCDEGIK': 'CDEKBAGI',
  'ABCDEGIL': 'CDEIBAGL',
  'ABCDEGJK': 'CDEKBAGJ',
  'ABCDEGJL': 'CDEJBAGL',
  'ABCDEGKL': 'CDEKBAGL',
  'ABCDEHIJ': 'CDHIBAJE',
  'ABCDEHIK': 'CDHKBAEI',
  'ABCDEHIL': 'CDHIBAEL',
  'ABCDEHJK': 'CDHKBAJE',
  'ABCDEHJL': 'CDHEBAJL',
  'ABCDEHKL': 'CDHKBAEL',
  'ABCDEIJK': 'CDEKBAJI',
  'ABCDEIJL': 'CDEIBAJL',
  'ABCDEIKL': 'CDEKBAIL',
  'ABCDEJKL': 'CDEKBAJL',
  'ABCDFGHI': 'CFHIBAGD',
  'ABCDFGHJ': 'CFHJBAGD',
  'ABCDFGHK': 'CFHKBAGD',
  'ABCDFGHL': 'DFCHBAGL',
  'ABCDFGIJ': 'DFCJBAGI',
  'ABCDFGIK': 'DFCKBAGI',
  'ABCDFGIL': 'DFCIBAGL',
  'ABCDFGJK': 'DFCKBAGJ',
  'ABCDFGJL': 'DFCJBAGL',
  'ABCDFGKL': 'DFCKBAGL',
  'ABCDFHIJ': 'CFHIBAJD',
  'ABCDFHIK': 'CDHKBAFI',
  'ABCDFHIL': 'CDHIBAFL',
  'ABCDFHJK': 'CFHKBAJD',
  'ABCDFHJL': 'DFCHBAJL',
  'ABCDFHKL': 'CDHKBAFL',
  'ABCDFIJK': 'DFCKBAJI',
  'ABCDFIJL': 'DFCIBAJL',
  'ABCDFIKL': 'DFCKBAIL',
  'ABCDFJKL': 'DFCKBAJL',
  'ABCDGHIJ': 'CDHJBAGI',
  'ABCDGHIK': 'CDHKBAGI',
  'ABCDGHIL': 'CDHIBAGL',
  'ABCDGHJK': 'CDHKBAGJ',
  'ABCDGHJL': 'CDHJBAGL',
  'ABCDGHKL': 'CDHKBAGL',
  'ABCDGIJK': 'DGCKBAJI',
  'ABCDGIJL': 'DGCIBAJL',
  'ABCDGIKL': 'CDIKBAGL',
  'ABCDGJKL': 'DGCKBAJL',
  'ABCDHIJK': 'CDHKBAJI',
  'ABCDHIJL': 'CDHIBAJL',
  'ABCDHIKL': 'CDHKBAIL',
  'ABCDHJKL': 'CDHKBAJL',
  'ABCDIJKL': 'CDIKBAJL',
  'ABCEFGHI': 'CFHIBAGE',
  'ABCEFGHJ': 'CFHJBAGE',
  'ABCEFGHK': 'CFHKBAGE',
  'ABCEFGHL': 'CFHEBAGL',
  'ABCEFGIJ': 'CFEJBAGI',
  'ABCEFGIK': 'CFEKBAGI',
  'ABCEFGIL': 'CFEIBAGL',
  'ABCEFGJK': 'CFEKBAGJ',
  'ABCEFGJL': 'CFEJBAGL',
  'ABCEFGKL': 'CFEKBAGL',
  'ABCEFHIJ': 'CFHIBAJE',
  'ABCEFHIK': 'CFHKBAEI',
  'ABCEFHIL': 'CFHIBAEL',
  'ABCEFHJK': 'CFHKBAJE',
  'ABCEFHJL': 'CFHEBAJL',
  'ABCEFHKL': 'CFHKBAEL',
  'ABCEFIJK': 'CFEKBAJI',
  'ABCEFIJL': 'CFEIBAJL',
  'ABCEFIKL': 'CFEKBAIL',
  'ABCEFJKL': 'CFEKBAJL',
  'ABCEGHIJ': 'CGHIBAJE',
  'ABCEGHIK': 'CHEKBAGI',
  'ABCEGHIL': 'CHEIBAGL',
  'ABCEGHJK': 'CGHKBAJE',
  'ABCEGHJL': 'CGHEBAJL',
  'ABCEGHKL': 'CHEKBAGL',
  'ABCEGIJK': 'CGEKBAJI',
  'ABCEGIJL': 'CGEIBAJL',
  'ABCEGIKL': 'ACEKBIGL',
  'ABCEGJKL': 'CGEKBAJL',
  'ABCEHIJK': 'CHEKBAJI',
  'ABCEHIJL': 'CHEIBAJL',
  'ABCEHIKL': 'CHEKBAIL',
  'ABCEHJKL': 'CHEKBAJL',
  'ABCEIJKL': 'ACEKBIJL',
  'ABCFGHIJ': 'CFHJBAGI',
  'ABCFGHIK': 'CFHKBAGI',
  'ABCFGHIL': 'CFHIBAGL',
  'ABCFGHJK': 'CFHKBAGJ',
  'ABCFGHJL': 'CFHJBAGL',
  'ABCFGHKL': 'CFHKBAGL',
  'ABCFGIJK': 'FGCKBAJI',
  'ABCFGIJL': 'FGCIBAJL',
  'ABCFGIKL': 'CFIKBAGL',
  'ABCFGJKL': 'FGCKBAJL',
  'ABCFHIJK': 'CFHKBAJI',
  'ABCFHIJL': 'CFHIBAJL',
  'ABCFHIKL': 'CFHKBAIL',
  'ABCFHJKL': 'CFHKBAJL',
  'ABCFIJKL': 'CFIKBAJL',
  'ABCGHIJK': 'CGHKBAJI',
  'ABCGHIJL': 'CGHIBAJL',
  'ABCGHIKL': 'CHIKBAGL',
  'ABCGHJKL': 'CGHKBAJL',
  'ABCGIJKL': 'CGIKBAJL',
  'ABCHIJKL': 'CHIKBAJL',
  'ABDEFGHI': 'DFHIBAGE',
  'ABDEFGHJ': 'DFHJBAGE',
  'ABDEFGHK': 'DFHKBAGE',
  'ABDEFGHL': 'DFHEBAGL',
  'ABDEFGIJ': 'DFEJBAGI',
  'ABDEFGIK': 'DFEKBAGI',
  'ABDEFGIL': 'DFEIBAGL',
  'ABDEFGJK': 'DFEKBAGJ',
  'ABDEFGJL': 'DFEJBAGL',
  'ABDEFGKL': 'DFEKBAGL',
  'ABDEFHIJ': 'DFHIBAJE',
  'ABDEFHIK': 'DFHKBAEI',
  'ABDEFHIL': 'DFHIBAEL',
  'ABDEFHJK': 'DFHKBAJE',
  'ABDEFHJL': 'DFHEBAJL',
  'ABDEFHKL': 'DFHKBAEL',
  'ABDEFIJK': 'DFEKBAJI',
  'ABDEFIJL': 'DFEIBAJL',
  'ABDEFIKL': 'DFEKBAIL',
  'ABDEFJKL': 'DFEKBAJL',
  'ABDEGHIJ': 'DGHIBAJE',
  'ABDEGHIK': 'DHEKBAGI',
  'ABDEGHIL': 'DHEIBAGL',
  'ABDEGHJK': 'DGHKBAJE',
  'ABDEGHJL': 'DGHEBAJL',
  'ABDEGHKL': 'DHEKBAGL',
  'ABDEGIJK': 'DGEKBAJI',
  'ABDEGIJL': 'DGEIBAJL',
  'ABDEGIKL': 'ADEKBIGL',
  'ABDEGJKL': 'DGEKBAJL',
  'ABDEHIJK': 'DHEKBAJI',
  'ABDEHIJL': 'DHEIBAJL',
  'ABDEHIKL': 'DHEKBAIL',
  'ABDEHJKL': 'DHEKBAJL',
  'ABDEIJKL': 'ADEKBIJL',
  'ABDFGHIJ': 'DFHJBAGI',
  'ABDFGHIK': 'DFHKBAGI',
  'ABDFGHIL': 'DFHIBAGL',
  'ABDFGHJK': 'DFHKBAGJ',
  'ABDFGHJL': 'DFHJBAGL',
  'ABDFGHKL': 'DFHKBAGL',
  'ABDFGIJK': 'DGFKBAJI',
  'ABDFGIJL': 'DGFIBAJL',
  'ABDFGIKL': 'DFIKBAGL',
  'ABDFGJKL': 'DGFKBAJL',
  'ABDFHIJK': 'DFHKBAJI',
  'ABDFHIJL': 'DFHIBAJL',
  'ABDFHIKL': 'DFHKBAIL',
  'ABDFHJKL': 'DFHKBAJL',
  'ABDFIJKL': 'DFIKBAJL',
  'ABDGHIJK': 'DGHKBAJI',
  'ABDGHIJL': 'DGHIBAJL',
  'ABDGHIKL': 'DHIKBAGL',
  'ABDGHJKL': 'DGHKBAJL',
  'ABDGIJKL': 'DGIKBAJL',
  'ABDHIJKL': 'DHIKBAJL',
  'ABEFGHIJ': 'FGHIBAJE',
  'ABEFGHIK': 'FHEKBAGI',
  'ABEFGHIL': 'FHEIBAGL',
  'ABEFGHJK': 'FGHKBAJE',
  'ABEFGHJL': 'FGHEBAJL',
  'ABEFGHKL': 'FHEKBAGL',
  'ABEFGIJK': 'FGEKBAJI',
  'ABEFGIJL': 'FGEIBAJL',
  'ABEFGIKL': 'AFEKBIGL',
  'ABEFGJKL': 'FGEKBAJL',
  'ABEFHIJK': 'FHEKBAJI',
  'ABEFHIJL': 'FHEIBAJL',
  'ABEFHIKL': 'FHEKBAIL',
  'ABEFHJKL': 'FHEKBAJL',
  'ABEFIJKL': 'AFEKBIJL',
  'ABEGHIJK': 'AGEKBHJI',
  'ABEGHIJL': 'AGEIBHJL',
  'ABEGHIKL': 'AHEKBIGL',
  'ABEGHJKL': 'AGEKBHJL',
  'ABEGIJKL': 'AGEKBIJL',
  'ABEHIJKL': 'AHEKBIJL',
  'ABFGHIJK': 'FGHKBAJI',
  'ABFGHIJL': 'FGHIBAJL',
  'ABFGHIKL': 'AFHKBIGL',
  'ABFGHJKL': 'FGHKBAJL',
  'ABFGIJKL': 'FGIKBAJL',
  'ABFHIJKL': 'AFHKBIJL',
  'ABGHIJKL': 'AGHKBIJL',
  'ACDEFGHI': 'CFHIEAGD',
  'ACDEFGHJ': 'CFHEJAGD',
  'ACDEFGHK': 'CFHKEAGD',
  'ACDEFGHL': 'CDHEFAGL',
  'ACDEFGIJ': 'DFCIJAGE',
  'ACDEFGIK': 'DFCKEAGI',
  'ACDEFGIL': 'DFCIEAGL',
  'ACDEFGJK': 'DFCKJAGE',
  'ACDEFGJL': 'DFCEJAGL',
  'ACDEFGKL': 'DFCKEAGL',
  'ACDEFHIJ': 'CFHIEAJD',
  'ACDEFHIK': 'CDHKFAEI',
  'ACDEFHIL': 'CDHIFAEL',
  'ACDEFHJK': 'CFHKEAJD',
  'ACDEFHJL': 'CDHEFAJL',
  'ACDEFHKL': 'CDHKFAEL',
  'ACDEFIJK': 'DFCKEAJI',
  'ACDEFIJL': 'DFCIEAJL',
  'ACDEFIKL': 'DFCKIAEL',
  'ACDEFJKL': 'DFCKEAJL',
  'ACDEGHIJ': 'CDHIJAGE',
  'ACDEGHIK': 'CDHKEAGI',
  'ACDEGHIL': 'CDHIEAGL',
  'ACDEGHJK': 'CDHKJAGE',
  'ACDEGHJL': 'CDHEJAGL',
  'ACDEGHKL': 'CDHKEAGL',
  'ACDEGIJK': 'CDEKJAGI',
  'ACDEGIJL': 'CDEIJAGL',
  'ACDEGIKL': 'CDEKIAGL',
  'ACDEGJKL': 'CDEKJAGL',
  'ACDEHIJK': 'CDHKEAJI',
  'ACDEHIJL': 'CDHIEAJL',
  'ACDEHIKL': 'CDHKIAEL',
  'ACDEHJKL': 'CDHKEAJL',
  'ACDEIJKL': 'CDEKIAJL',
  'ACDFGHIJ': 'CFHIJAGD',
  'ACDFGHIK': 'CDHKFAGI',
  'ACDFGHIL': 'CDHIFAGL',
  'ACDFGHJK': 'CFHKJAGD',
  'ACDFGHJL': 'DFCHJAGL',
  'ACDFGHKL': 'CDHKFAGL',
  'ACDFGIJK': 'DFCKJAGI',
  'ACDFGIJL': 'DFCIJAGL',
  'ACDFGIKL': 'DFCKIAGL',
  'ACDFGJKL': 'DFCKJAGL',
  'ACDFHIJK': 'CDHKFAJI',
  'ACDFHIJL': 'CDHIFAJL',
  'ACDFHIKL': 'CDHKIAFL',
  'ACDFHJKL': 'CDHKFAJL',
  'ACDFIJKL': 'DFCKIAJL',
  'ACDGHIJK': 'CDHKJAGI',
  'ACDGHIJL': 'CDHIJAGL',
  'ACDGHIKL': 'CDHKIAGL',
  'ACDGHJKL': 'CDHKJAGL',
  'ACDGIJKL': 'CDIKJAGL',
  'ACDHIJKL': 'CDHKIAJL',
  'ACEFGHIJ': 'CFHIJAGE',
  'ACEFGHIK': 'CFHKEAGI',
  'ACEFGHIL': 'CFHIEAGL',
  'ACEFGHJK': 'CFHKJAGE',
  'ACEFGHJL': 'CFHEJAGL',
  'ACEFGHKL': 'CFHKEAGL',
  'ACEFGIJK': 'CFEKJAGI',
  'ACEFGIJL': 'CFEIJAGL',
  'ACEFGIKL': 'CFEKIAGL',
  'ACEFGJKL': 'CFEKJAGL',
  'ACEFHIJK': 'CFHKEAJI',
  'ACEFHIJL': 'CFHIEAJL',
  'ACEFHIKL': 'CFHKIAEL',
  'ACEFHJKL': 'CFHKEAJL',
  'ACEFIJKL': 'CFEKIAJL',
  'ACEGHIJK': 'CHEKJAGI',
  'ACEGHIJL': 'CHEIJAGL',
  'ACEGHIKL': 'CHEKIAGL',
  'ACEGHJKL': 'CHEKJAGL',
  'ACEGIJKL': 'CGEKIAJL',
  'ACEHIJKL': 'CHEKIAJL',
  'ACFGHIJK': 'CFHKJAGI',
  'ACFGHIJL': 'CFHIJAGL',
  'ACFGHIKL': 'CFHKIAGL',
  'ACFGHJKL': 'CFHKJAGL',
  'ACFGIJKL': 'CFIKJAGL',
  'ACFHIJKL': 'CFHKIAJL',
  'ACGHIJKL': 'CGHKIAJL',
  'ADEFGHIJ': 'DFHIJAGE',
  'ADEFGHIK': 'DFHKEAGI',
  'ADEFGHIL': 'DFHIEAGL',
  'ADEFGHJK': 'DFHKJAGE',
  'ADEFGHJL': 'DFHEJAGL',
  'ADEFGHKL': 'DFHKEAGL',
  'ADEFGIJK': 'DFEKJAGI',
  'ADEFGIJL': 'DFEIJAGL',
  'ADEFGIKL': 'DFEKIAGL',
  'ADEFGJKL': 'DFEKJAGL',
  'ADEFHIJK': 'DFHKEAJI',
  'ADEFHIJL': 'DFHIEAJL',
  'ADEFHIKL': 'DFHKIAEL',
  'ADEFHJKL': 'DFHKEAJL',
  'ADEFIJKL': 'DFEKIAJL',
  'ADEGHIJK': 'DHEKJAGI',
  'ADEGHIJL': 'DHEIJAGL',
  'ADEGHIKL': 'DHEKIAGL',
  'ADEGHJKL': 'DHEKJAGL',
  'ADEGIJKL': 'DGEKIAJL',
  'ADEHIJKL': 'DHEKIAJL',
  'ADFGHIJK': 'DFHKJAGI',
  'ADFGHIJL': 'DFHIJAGL',
  'ADFGHIKL': 'DFHKIAGL',
  'ADFGHJKL': 'DFHKJAGL',
  'ADFGIJKL': 'DFIKJAGL',
  'ADFHIJKL': 'DFHKIAJL',
  'ADGHIJKL': 'DGHKIAJL',
  'AEFGHIJK': 'FHEKJAGI',
  'AEFGHIJL': 'FHEIJAGL',
  'AEFGHIKL': 'FHEKIAGL',
  'AEFGHJKL': 'FHEKJAGL',
  'AEFGIJKL': 'FGEKIAJL',
  'AEFHIJKL': 'FHEKIAJL',
  'AEGHIJKL': 'AGEKIHJL',
  'AFGHIJKL': 'FGHKIAJL',
  'BCDEFGHI': 'DFCIBHGE',
  'BCDEFGHJ': 'CFHEBJGD',
  'BCDEFGHK': 'DFCKBHGE',
  'BCDEFGHL': 'DFCEBHGL',
  'BCDEFGIJ': 'DFCIBJGE',
  'BCDEFGIK': 'DFCKBEGI',
  'BCDEFGIL': 'DFCIBEGL',
  'BCDEFGJK': 'DFCKBJGE',
  'BCDEFGJL': 'DFCEBJGL',
  'BCDEFGKL': 'DFCKBEGL',
  'BCDEFHIJ': 'DFCIBHJE',
  'BCDEFHIK': 'DFCKBHEI',
  'BCDEFHIL': 'DFCIBHEL',
  'BCDEFHJK': 'DFCKBHJE',
  'BCDEFHJL': 'DFCEBHJL',
  'BCDEFHKL': 'DFCKBHEL',
  'BCDEFIJK': 'DFCKBEJI',
  'BCDEFIJL': 'DFCIBEJL',
  'BCDEFIKL': 'DFCKBIEL',
  'BCDEFJKL': 'DFCKBEJL',
  'BCDEGHIJ': 'CDHIBJGE',
  'BCDEGHIK': 'CDEKBHGI',
  'BCDEGHIL': 'CDEIBHGL',
  'BCDEGHJK': 'CDHKBJGE',
  'BCDEGHJL': 'CDHEBJGL',
  'BCDEGHKL': 'CDEKBHGL',
  'BCDEGIJK': 'CDEKBJGI',
  'BCDEGIJL': 'CDEIBJGL',
  'BCDEGIKL': 'CDEKBIGL',
  'BCDEGJKL': 'CDEKBJGL',
  'BCDEHIJK': 'CDEKBHJI',
  'BCDEHIJL': 'CDEIBHJL',
  'BCDEHIKL': 'CDEKBHIL',
  'BCDEHJKL': 'CDEKBHJL',
  'BCDEIJKL': 'CDEKBIJL',
  'BCDFGHIJ': 'CFHIBJGD',
  'BCDFGHIK': 'DFCKBHGI',
  'BCDFGHIL': 'DFCIBHGL',
  'BCDFGHJK': 'CFHKBJGD',
  'BCDFGHJL': 'DFCJBHGL',
  'BCDFGHKL': 'DFCKBHGL',
  'BCDFGIJK': 'DFCKBJGI',
  'BCDFGIJL': 'DFCIBJGL',
  'BCDFGIKL': 'DFCKBIGL',
  'BCDFGJKL': 'DFCKBJGL',
  'BCDFHIJK': 'DFCKBHJI',
  'BCDFHIJL': 'DFCIBHJL',
  'BCDFHIKL': 'DFCKBHIL',
  'BCDFHJKL': 'DFCKBHJL',
  'BCDFIJKL': 'DFCKBIJL',
  'BCDGHIJK': 'CDHKBJGI',
  'BCDGHIJL': 'CDHIBJGL',
  'BCDGHIKL': 'CDHKBIGL',
  'BCDGHJKL': 'CDHKBJGL',
  'BCDGIJKL': 'CDIKBJGL',
  'BCDHIJKL': 'CDHKBIJL',
  'BCEFGHIJ': 'CFHIBJGE',
  'BCEFGHIK': 'CFEKBHGI',
  'BCEFGHIL': 'CFEIBHGL',
  'BCEFGHJK': 'CFHKBJGE',
  'BCEFGHJL': 'CFHEBJGL',
  'BCEFGHKL': 'CFEKBHGL',
  'BCEFGIJK': 'CFEKBJGI',
  'BCEFGIJL': 'CFEIBJGL',
  'BCEFGIKL': 'CFEKBIGL',
  'BCEFGJKL': 'CFEKBJGL',
  'BCEFHIJK': 'CFEKBHJI',
  'BCEFHIJL': 'CFEIBHJL',
  'BCEFHIKL': 'CFEKBHIL',
  'BCEFHJKL': 'CFEKBHJL',
  'BCEFIJKL': 'CFEKBIJL',
  'BCEGHIJK': 'CGEKBHJI',
  'BCEGHIJL': 'CGEIBHJL',
  'BCEGHIKL': 'CHEKBIGL',
  'BCEGHJKL': 'CGEKBHJL',
  'BCEGIJKL': 'CGEKBIJL',
  'BCEHIJKL': 'CHEKBIJL',
  'BCFGHIJK': 'CFHKBJGI',
  'BCFGHIJL': 'CFHIBJGL',
  'BCFGHIKL': 'CFHKBIGL',
  'BCFGHJKL': 'CFHKBJGL',
  'BCFGIJKL': 'CFIKBJGL',
  'BCFHIJKL': 'CFHKBIJL',
  'BCGHIJKL': 'CGHKBIJL',
  'BDEFGHIJ': 'DFHIBJGE',
  'BDEFGHIK': 'DFEKBHGI',
  'BDEFGHIL': 'DFEIBHGL',
  'BDEFGHJK': 'DFHKBJGE',
  'BDEFGHJL': 'DFHEBJGL',
  'BDEFGHKL': 'DFEKBHGL',
  'BDEFGIJK': 'DFEKBJGI',
  'BDEFGIJL': 'DFEIBJGL',
  'BDEFGIKL': 'DFEKBIGL',
  'BDEFGJKL': 'DFEKBJGL',
  'BDEFHIJK': 'DFEKBHJI',
  'BDEFHIJL': 'DFEIBHJL',
  'BDEFHIKL': 'DFEKBHIL',
  'BDEFHJKL': 'DFEKBHJL',
  'BDEFIJKL': 'DFEKBIJL',
  'BDEGHIJK': 'DGEKBHJI',
  'BDEGHIJL': 'DGEIBHJL',
  'BDEGHIKL': 'DHEKBIGL',
  'BDEGHJKL': 'DGEKBHJL',
  'BDEGIJKL': 'DGEKBIJL',
  'BDEHIJKL': 'DHEKBIJL',
  'BDFGHIJK': 'DFHKBJGI',
  'BDFGHIJL': 'DFHIBJGL',
  'BDFGHIKL': 'DFHKBIGL',
  'BDFGHJKL': 'DFHKBJGL',
  'BDFGIJKL': 'DFIKBJGL',
  'BDFHIJKL': 'DFHKBIJL',
  'BDGHIJKL': 'DGHKBIJL',
  'BEFGHIJK': 'FGEKBHJI',
  'BEFGHIJL': 'FGEIBHJL',
  'BEFGHIKL': 'FHEKBIGL',
  'BEFGHJKL': 'FGEKBHJL',
  'BEFGIJKL': 'FGEKBIJL',
  'BEFHIJKL': 'FHEKBIJL',
  'BEGHIJKL': 'BGEKIHJL',
  'BFGHIJKL': 'FGHKBIJL',
  'CDEFGHIJ': 'DFCIJHGE',
  'CDEFGHIK': 'DFCKEHGI',
  'CDEFGHIL': 'DFCIEHGL',
  'CDEFGHJK': 'DFCKJHGE',
  'CDEFGHJL': 'DFCEJHGL',
  'CDEFGHKL': 'DFCKEHGL',
  'CDEFGIJK': 'DFCKEJGI',
  'CDEFGIJL': 'DFCIEJGL',
  'CDEFGIKL': 'DFCKEIGL',
  'CDEFGJKL': 'DFCKEJGL',
  'CDEFHIJK': 'DFCKEHJI',
  'CDEFHIJL': 'DFCIEHJL',
  'CDEFHIKL': 'DFCKIHEL',
  'CDEFHJKL': 'DFCKEHJL',
  'CDEFIJKL': 'DFCKEIJL',
  'CDEGHIJK': 'CDEKJHGI',
  'CDEGHIJL': 'CDEIJHGL',
  'CDEGHIKL': 'CDEKIHGL',
  'CDEGHJKL': 'CDEKJHGL',
  'CDEGIJKL': 'CDEKIJGL',
  'CDEHIJKL': 'CDEKIHJL',
  'CDFGHIJK': 'DFCKJHGI',
  'CDFGHIJL': 'DFCIJHGL',
  'CDFGHIKL': 'DFCKIHGL',
  'CDFGHJKL': 'DFCKJHGL',
  'CDFGIJKL': 'DFCKIJGL',
  'CDFHIJKL': 'DFCKIHJL',
  'CDGHIJKL': 'CDHKIJGL',
  'CEFGHIJK': 'CFEKJHGI',
  'CEFGHIJL': 'CFEIJHGL',
  'CEFGHIKL': 'CFEKIHGL',
  'CEFGHJKL': 'CFEKJHGL',
  'CEFGIJKL': 'CFEKIJGL',
  'CEFHIJKL': 'CFEKIHJL',
  'CEGHIJKL': 'CGEKIHJL',
  'CFGHIJKL': 'CFHKIJGL',
  'DEFGHIJK': 'DFEKJHGI',
  'DEFGHIJL': 'DFEIJHGL',
  'DEFGHIKL': 'DFEKIHGL',
  'DEFGHJKL': 'DFEKJHGL',
  'DEFGIJKL': 'DFEKIJGL',
  'DEFHIJKL': 'DFEKIHJL',
  'DEGHIJKL': 'DGEKIHJL',
  'DFGHIJKL': 'DFHKIJGL',
  'EFGHIJKL': 'FGEKIHJL',
};

/**
 * Look up the official FIFA assignment for a given set of 8 qualifying groups.
 *
 * @param {string[]} qualifyingGroups - the 8 group letters that qualify
 * @returns {Object|null} { matchId: groupLetter } or null if combination not found
 */
export function resolveThirdPlaceSlots(qualifyingGroups) {
  if (!qualifyingGroups || qualifyingGroups.length !== 8) return null;

  const key = [...qualifyingGroups].sort().join('');
  const compact = FIFA_ASSIGNMENT_TABLE[key];
  if (!compact) return null;

  const assignment = {};
  for (let i = 0; i < SLOT_MATCH_IDS.length; i++) {
    assignment[SLOT_MATCH_IDS[i]] = compact[i];
  }
  return assignment;
}
