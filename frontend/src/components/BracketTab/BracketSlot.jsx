import { shortLabel } from '../../utils/bracket';
import { teamNamePt } from '../../utils/i18n';
import { gameToUTC, formatBRT } from '../../utils/time';
import styles from './BracketSlot.module.css';

// slotHeight: the vertical cell height (px) that aligns this slot in the bracket
export default function BracketSlot({ game, homeResolved, awayResolved, slotHeight, hasConnector, showGroup = true }) {
  const isFinished = game?.finished === 'TRUE';
  const isLive =
    game?.finished === 'FALSE' && game?.time_elapsed !== 'notstarted';
  const isNotStarted = game?.finished === 'FALSE' && game?.time_elapsed === 'notstarted';

  let matchDate = null, matchTime = null, matchWeekday = null;
  if (game?.local_date && game?.stadium_id) {
    const utc = gameToUTC(game.local_date, game.stadium_id);
    const fmt = formatBRT(utc);
    matchDate    = fmt.date.slice(0, 5); // "29/06"
    matchTime    = fmt.time;             // "16:00"
    matchWeekday = fmt.weekday.slice(0, 3); // "qua"
  }

  const hasPenalties = game?.home_penalty != null && game?.away_penalty != null;
  const homeWinner = isFinished && (
    hasPenalties
      ? +game.home_penalty > +game.away_penalty
      : +game.home_score > +game.away_score
  );
  const awayWinner = isFinished && (
    hasPenalties
      ? +game.away_penalty > +game.home_penalty
      : +game.away_score > +game.home_score
  );
  // In a finished knockout match the non-winning side is eliminated.
  const homeLoser = isFinished && awayWinner;
  const awayLoser = isFinished && homeWinner;

  return (
    <div
      className={`${styles.slot} ${hasConnector ? styles.connector : ''}`}
      style={{ height: slotHeight }}
    >
      <div className={`${styles.card} ${isLive ? styles.live : ''}`}>
        {game ? (
          <>
            <TeamRow
              resolved={homeResolved}
              label={game.home_team_label}
              score={isFinished || isLive ? game.home_score : null}
              penalty={hasPenalties ? game.home_penalty : null}
              isWinner={homeWinner}
              isLoser={homeLoser}
              isLive={isLive}
              showGroup={showGroup}
            />
            <div className={styles.divider} />
            <TeamRow
              resolved={awayResolved}
              label={game.away_team_label}
              score={isFinished || isLive ? game.away_score : null}
              penalty={hasPenalties ? game.away_penalty : null}
              isWinner={awayWinner}
              isLoser={awayLoser}
              showGroup={showGroup}
            />
            {isNotStarted && matchDate && (
              <div className={styles.matchDate}>{matchWeekday} · {matchDate} · {matchTime} BRT</div>
            )}
          </>
        ) : (
          <span className={styles.tbd}>A definir</span>
        )}
      </div>
    </div>
  );
}

function TeamRow({ resolved, label, score, penalty, isWinner, isLoser, isLive, showGroup }) {
  const { team, projected, group } = resolved ?? { team: null, projected: false, group: null };

  return (
    <div className={`${styles.team} ${isWinner ? styles.winner : ''} ${isLoser ? styles.loser : ''} ${!team ? styles.unknown : ''} ${team && !projected && !isLoser ? styles.confirmed : ''}`}>
      {team?.flag ? (
        <img className={styles.flag} src={team.flag} alt={teamNamePt(team.name_en)} loading="lazy" />
      ) : (
        <span className={styles.flagPlaceholder} />
      )}
      <span
        className={`${styles.teamName} ${isWinner ? styles.winner : ''} ${isLoser ? styles.loser : ''} ${projected ? styles.projected : ''}`}
      >
        {teamNamePt(team?.name_en) ?? shortLabel(label)}
        {projected && team && <span className={styles.projBadge}> proj</span>}
      </span>
      {showGroup && group && <span className={styles.groupBadge}>{group}</span>}
      {isLive && <span className={styles.liveBadge}>AO VIVO</span>}
      {score !== null && (
        <span className={`${styles.score} ${isWinner ? styles.winner : ''}`}>
          {score}{penalty != null && <span className={styles.penaltyScore}> ({penalty})</span>}
        </span>
      )}
    </div>
  );
}
