import { useEffect, useRef, useState } from 'react';
import { gameToUTC, formatBRT } from '../../utils/time';
import { matchStatus, stageLabel, parseScorers } from '../../utils/parsers';
import styles from './MatchCard.module.css';

function TeamSide({ name, flag, side }) {
  return (
    <div className={`${styles.team} ${side === 'away' ? styles.away : ''}`}>
      {flag && <img className={styles.flag} src={flag} alt={name} loading="lazy" />}
      <span className={styles.teamName}>{name}</span>
    </div>
  );
}

export default function MatchCard({ game, teamMap, stadiumMap }) {
  const status = matchStatus(game);
  const isLive = status === 'live';
  const isFinished = status === 'finished';

  const homeTeam = teamMap[game.home_team_id];
  const awayTeam = teamMap[game.away_team_id];
  const stadium = stadiumMap[game.stadium_id];

  const utcDate = gameToUTC(game.local_date, game.stadium_id);
  const { time: kickoffBRT } = formatBRT(utcDate);

  const homeScorers = (isFinished || isLive) ? parseScorers(game.home_scorers) : [];
  const awayScorers = (isFinished || isLive) ? parseScorers(game.away_scorers) : [];
  const hasScorers = homeScorers.length > 0 || awayScorers.length > 0;

  // Flash score when it changes during a live match
  const scoreKey = `${game.home_score}-${game.away_score}`;
  const prevScoreRef = useRef(scoreKey);
  const [scorePulse, setScorePulse] = useState(false);
  useEffect(() => {
    if (isLive && prevScoreRef.current !== scoreKey) {
      setScorePulse(true);
      const t = setTimeout(() => setScorePulse(false), 1200);
      prevScoreRef.current = scoreKey;
      return () => clearTimeout(t);
    }
    prevScoreRef.current = scoreKey;
  }, [scoreKey, isLive]);

  return (
    <div className={`${styles.card} ${isLive ? styles.live : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <span>{stageLabel(game)}</span>
        {isLive && (
          <span className={styles.liveBadge}>
            <span className={styles.liveDot} />
            AO VIVO {game.time_elapsed !== 'notstarted' ? `· ${game.time_elapsed}` : ''}
          </span>
        )}
        {isFinished && <span>Encerrado</span>}
      </div>

      {/* Teams + Score/Time */}
      <div className={styles.teams}>
        <TeamSide name={game.home_team_name_en} flag={homeTeam?.flag} side="home" />

        <div className={styles.scoreOrTime}>
          {isFinished || isLive ? (
            <>
              <span className={`${styles.score} ${scorePulse ? styles.scorePulse : ''}`}>
                {game.home_score} – {game.away_score}
              </span>
              {isLive && game.time_elapsed && game.time_elapsed !== 'notstarted' && (
                <span className={styles.elapsed}>{game.time_elapsed}</span>
              )}
            </>
          ) : (
            <>
              <span className={styles.kickoff}>{kickoffBRT}</span>
              <span className={styles.kickoffLabel}>BRT</span>
            </>
          )}
        </div>

        <TeamSide name={game.away_team_name_en} flag={awayTeam?.flag} side="away" />
      </div>

      {/* Scorers */}
      {hasScorers && (
        <div className={styles.scorers}>
          <div className={styles.scorerCol}>
            {homeScorers.map((s, i) => <span key={i} className={styles.scorer}>⚽ {s}</span>)}
          </div>
          <div className={`${styles.scorerCol} ${styles.scorerColAway}`}>
            {awayScorers.map((s, i) => <span key={i} className={styles.scorer}>{s} ⚽</span>)}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        {stadium && <span>{stadium.fifa_name ?? stadium.name_en}</span>}
        {stadium && <span className={styles.footerSep}>·</span>}
        <span>{stadium?.city_en}</span>
      </div>
    </div>
  );
}
