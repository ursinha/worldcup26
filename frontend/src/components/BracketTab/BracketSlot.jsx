import { shortLabel } from '../../utils/bracket';
import styles from './BracketSlot.module.css';

// slotHeight: the vertical cell height (px) that aligns this slot in the bracket
export default function BracketSlot({ game, homeResolved, awayResolved, slotHeight, hasConnector }) {
  const isFinished = game?.finished === 'TRUE';
  const isLive =
    game?.finished === 'FALSE' && game?.time_elapsed !== 'notstarted';

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
              isWinner={isFinished && +game.home_score > +game.away_score}
              isLive={isLive}
            />
            <div className={styles.divider} />
            <TeamRow
              resolved={awayResolved}
              label={game.away_team_label}
              score={isFinished || isLive ? game.away_score : null}
              isWinner={isFinished && +game.away_score > +game.home_score}
            />
          </>
        ) : (
          <span className={styles.tbd}>TBD</span>
        )}
      </div>
    </div>
  );
}

function TeamRow({ resolved, label, score, isWinner, isLive }) {
  const { team, projected } = resolved ?? { team: null, projected: false };

  return (
    <div className={`${styles.team} ${isWinner ? styles.winner : ''} ${!team ? styles.unknown : ''} ${team && !projected ? styles.confirmed : ''}`}>
      {team?.flag ? (
        <img className={styles.flag} src={team.flag} alt={team.name_en} loading="lazy" />
      ) : (
        <span className={styles.flagPlaceholder} />
      )}
      <span
        className={`${styles.teamName} ${isWinner ? styles.winner : ''} ${projected ? styles.projected : ''}`}
      >
        {team?.name_en ?? shortLabel(label)}
        {projected && team && <span className={styles.projBadge}> proj</span>}
      </span>
      {isLive && <span className={styles.liveBadge}>AO VIVO</span>}
      {score !== null && (
        <span className={`${styles.score} ${isWinner ? styles.winner : ''}`}>{score}</span>
      )}
    </div>
  );
}
