import { useMemo } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { BRACKET_ROUNDS, THIRD_PLACE_ID, resolveSlot } from '../../utils/bracket';
import { projectStandings } from '../../utils/projectedStandings';
import { rankThirdPlaceTeams, resolveThirdPlaceSlots } from '../../utils/thirdPlace';
import BracketSlot from './BracketSlot';
import styles from './BracketTab.module.css';

const BASE = 100; // px — height of one R32 slot; all other rounds are multiples

/**
 * Split BRACKET_ROUNDS into upper/lower halves.
 * Each half is an array of { id, label, slotMult, pairGroups } matching the
 * original shape but containing only that half's pair groups.
 * The SF round (single pair with 2 matches) is split into two single-match pairs.
 * The final round is excluded from both halves.
 */
function splitBracketHalves() {
  const upper = [];
  const lower = [];

  for (const round of BRACKET_ROUNDS) {
    if (round.id === 'final') continue;

    if (round.id === 'sf') {
      // SF has one pairGroup with 2 matches — split them
      const [m1, m2] = round.pairGroups[0];
      upper.push({ ...round, pairGroups: [[m1]] });
      lower.push({ ...round, pairGroups: [[m2]] });
    } else {
      const mid = Math.floor(round.pairGroups.length / 2);
      upper.push({ ...round, pairGroups: round.pairGroups.slice(0, mid) });
      lower.push({ ...round, pairGroups: round.pairGroups.slice(mid) });
    }
  }

  return { upper, lower };
}

const { upper: UPPER_ROUNDS, lower: LOWER_ROUNDS } = splitBracketHalves();
const FINAL_ROUND = BRACKET_ROUNDS[BRACKET_ROUNDS.length - 1];

export default function BracketTab() {
  const { data: matchesData, loading } = usePolling('/api/matches', 15_000);
  const { data: groupsData } = usePolling('/api/groups', 15_000);
  const { data: teamsData } = usePolling('/api/teams', 60_000);

  // Build lookup maps
  const gameMap = useMemo(() => {
    if (!matchesData?.games) return {};
    return Object.fromEntries(matchesData.games.map((g) => [g.id, g]));
  }, [matchesData]);

  const teamMap = useMemo(() => {
    if (!teamsData?.teams) return {};
    return Object.fromEntries(teamsData.teams.map((t) => [t.id, t]));
  }, [teamsData]);

  // Projected groups for 3rd-place resolution
  const projectedGroups = useMemo(() => {
    if (!groupsData?.groups) return [];
    return projectStandings(groupsData.groups, matchesData?.games);
  }, [groupsData, matchesData]);

  const groupMap = useMemo(() => {
    if (!projectedGroups.length) return {};
    return Object.fromEntries(projectedGroups.map((g) => [g.name, g]));
  }, [projectedGroups]);

  // Compute 3rd-place assignment for bracket resolution
  const thirdPlaceAssignment = useMemo(() => {
    const ranked = rankThirdPlaceTeams(projectedGroups, matchesData?.games);
    const qualifyingGroups = ranked
      .filter((t) => t.qualifying)
      .map((t) => t.group);
    if (qualifyingGroups.length !== 8) return null;
    return resolveThirdPlaceSlots(qualifyingGroups);
  }, [projectedGroups, matchesData]);

  if (loading) return <div className={styles.loading}>Carregando chaveamento…</div>;

  function resolveGame(matchId) {
    const game = gameMap[matchId];
    const opts = { thirdPlaceAssignment, currentMatchId: matchId };
    const homeResolved = resolveSlot(
      game?.home_team_id, game?.home_team_label,
      gameMap, groupMap, teamMap, 0, opts,
    );
    const awayResolved = resolveSlot(
      game?.away_team_id, game?.away_team_label,
      gameMap, groupMap, teamMap, 0, opts,
    );
    return { game, homeResolved, awayResolved };
  }

  function renderHalf(rounds, halfClass) {
    return (
      <div className={`${styles.halfBox} ${halfClass}`}>
        <div className={styles.halfBracket}>
          {rounds.map((round, rIdx) => {
            const slotH = BASE * round.slotMult;
            const isLastInHalf = rIdx === rounds.length - 1;
            const pairHasConnector = !isLastInHalf;
            const slotHasConnector = rIdx > 0;

            const pairConnectorTop = `${slotH / 2}px`;
            const pairConnectorH = `${slotH}px`;

            return (
              <div key={round.id} className={styles.roundCol}>
                {rIdx === 0 && <div className={styles.roundLabel}>{round.label}</div>}
                {rIdx > 0 && <div className={styles.roundLabel}>{round.label}</div>}

                {round.pairGroups.map((matchIds, pIdx) => (
                  <div
                    key={pIdx}
                    className={`${styles.pair} ${pairHasConnector && matchIds.length > 1 ? styles.hasConnector : ''}`}
                    style={{
                      '--pair-connector-top': pairConnectorTop,
                      '--pair-connector-h': pairConnectorH,
                    }}
                  >
                    {matchIds.map((matchId) => {
                      const { game, homeResolved, awayResolved } = resolveGame(matchId);
                      return (
                        <BracketSlot
                          key={matchId}
                          game={game ?? null}
                          homeResolved={homeResolved}
                          awayResolved={awayResolved}
                          slotHeight={slotH}
                          hasConnector={slotHasConnector}
                          showGroup={round.id === 'r32' || round.id === 'r16' || round.id === 'qf'}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Final round
  const finalSlotH = BASE * FINAL_ROUND.slotMult;
  const finalMatchId = FINAL_ROUND.pairGroups[0][0];
  const { game: finalGame, homeResolved: finalHome, awayResolved: finalAway } = resolveGame(finalMatchId);

  const thirdGame = gameMap[THIRD_PLACE_ID];

  return (
    <div className={styles.outer}>
      <div className={styles.bracketLayout}>
        <div className={styles.halvesCol}>
          {renderHalf(UPPER_ROUNDS, styles.upperHalf)}
          {renderHalf(LOWER_ROUNDS, styles.lowerHalf)}
        </div>

        <div className={styles.finalSection}>
          <div className={styles.finalBox}>
            <div className={styles.finalLabel}>{FINAL_ROUND.label}</div>
            <BracketSlot
              game={finalGame ?? null}
              homeResolved={finalHome}
              awayResolved={finalAway}
              slotHeight={finalSlotH}
              hasConnector={false}
              showGroup={false}
            />
          </div>
        </div>
      </div>

      {/* Third-place match */}
      {thirdGame && (
        <div className={styles.thirdSection}>
          <div className={styles.thirdLabel}>Disputa de 3º Lugar</div>
          <BracketSlot
            game={thirdGame}
            homeResolved={resolveSlot(thirdGame.home_team_id, thirdGame.home_team_label, gameMap, groupMap, teamMap)}
            awayResolved={resolveSlot(thirdGame.away_team_id, thirdGame.away_team_label, gameMap, groupMap, teamMap)}
            slotHeight={BASE}
            hasConnector={false}
            showGroup={false}
          />
        </div>
      )}
    </div>
  );
}
