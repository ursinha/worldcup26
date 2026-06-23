import { useMemo } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { BRACKET_ROUNDS, THIRD_PLACE_ID, resolveSlot } from '../../utils/bracket';
import BracketSlot from './BracketSlot';
import styles from './BracketTab.module.css';

const BASE = 84; // px — height of one R32 slot; all other rounds are multiples

export default function BracketTab() {
  const { data: matchesData, loading } = usePolling('/api/matches', 15_000);
  const { data: groupsData } = usePolling('/api/groups', 15_000);
  const { data: teamsData } = usePolling('/api/teams', 60_000);

  // Build lookup maps
  const gameMap = useMemo(() => {
    if (!matchesData?.games) return {};
    return Object.fromEntries(matchesData.games.map((g) => [g.id, g]));
  }, [matchesData]);

  const groupMap = useMemo(() => {
    if (!groupsData?.groups) return {};
    return Object.fromEntries(groupsData.groups.map((g) => [g.name, g]));
  }, [groupsData]);

  const teamMap = useMemo(() => {
    if (!teamsData?.teams) return {};
    return Object.fromEntries(teamsData.teams.map((t) => [t.id, t]));
  }, [teamsData]);

  if (loading) return <div className={styles.loading}>Carregando chaveamento…</div>;

  const thirdGame = gameMap[THIRD_PLACE_ID];

  return (
    <div className={styles.outer}>
      <div className={styles.bracket}>
        {BRACKET_ROUNDS.map((round, rIdx) => {
          const slotH = BASE * round.slotMult;
          const isFinalRound = rIdx === BRACKET_ROUNDS.length - 1;
          // Pairs in the LAST column don't need a right-side connector
          const pairHasConnector = !isFinalRound;
          // Slots in all rounds except the first need a left-side connector
          const slotHasConnector = rIdx > 0;

          // Vertical connector measurements for this round's pairs
          // top  = distance from pair top to center of first slot = slotH / 2
          // h    = distance from center of first slot to center of second slot = slotH
          const pairConnectorTop = `${slotH / 2}px`;
          const pairConnectorH = `${slotH}px`;

          return (
            <div key={round.id} className={styles.roundCol}>
              <div className={styles.roundLabel}>{round.label}</div>

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
                    const game = gameMap[matchId];
                    const homeResolved = resolveSlot(
                      game?.home_team_id,
                      game?.home_team_label,
                      gameMap,
                      groupMap,
                      teamMap,
                    );
                    const awayResolved = resolveSlot(
                      game?.away_team_id,
                      game?.away_team_label,
                      gameMap,
                      groupMap,
                      teamMap,
                    );

                    return (
                      <BracketSlot
                        key={matchId}
                        game={game ?? null}
                        homeResolved={homeResolved}
                        awayResolved={awayResolved}
                        slotHeight={slotH}
                        hasConnector={slotHasConnector}
                        showGroup={rIdx < 3}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
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
