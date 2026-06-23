import { useEffect, useRef, useState } from 'react';
import { gameToUTC, formatBRT } from '../../utils/time';
import { matchStatus, stageLabel, parseScorers } from '../../utils/parsers';
import styles from './MatchCard.module.css';

function useMatchClock(game, isLive) {
  function compute() {
    if (!isLive) return null;
    if (game.period === 'HT') return 'HT';
    if (game.clock_seconds == null || game.enriched_at == null) return null;
    const secs = game.clock_seconds + (Date.now() - game.enriched_at) / 1000;
    return `${Math.ceil(secs / 60)}'`;
  }

  const [clock, setClock] = useState(compute);

  useEffect(() => {
    setClock(compute());
    if (!isLive || game.period === 'HT') return;
    const t = setInterval(() => setClock(compute()), 60_000);
    return () => clearInterval(t);
  }, [isLive, game.clock_seconds, game.enriched_at, game.period]);

  return clock;
}

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
  const stadium  = stadiumMap[game.stadium_id];

  const utcDate    = gameToUTC(game.local_date, game.stadium_id);
  const { time: kickoffBRT } = formatBRT(utcDate);

  const homeScorers = (isFinished || isLive) ? parseScorers(game.home_scorers) : [];
  const awayScorers = (isFinished || isLive) ? parseScorers(game.away_scorers) : [];
  const hasScorers  = homeScorers.length > 0 || awayScorers.length > 0;

  const cards     = game.events?.filter(e => e.type === 'yellow_card' || e.type === 'red_card') ?? [];
  const homeCards = cards.filter(e => e.team === 'home');
  const awayCards = cards.filter(e => e.team === 'away');
  const hasCards  = homeCards.length > 0 || awayCards.length > 0;

  const clock = useMatchClock(game, isLive);

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
            AO VIVO{clock ? ` · ${clock}` : ''}
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
              {isLive && clock && (
                <span className={styles.elapsed}>{clock}</span>
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

      {/* Cards */}
      {hasCards && (
        <div className={styles.cards}>
          <div className={styles.cardCol}>
            {homeCards.map((e, i) => (
              <span key={i} className={styles.cardEntry}>
                <span className={e.type === 'red_card' ? styles.redCard : styles.yellowCard} />
                {e.player} {e.minute}
              </span>
            ))}
          </div>
          <div className={`${styles.cardCol} ${styles.cardColAway}`}>
            {awayCards.map((e, i) => (
              <span key={i} className={styles.cardEntry}>
                {e.player} {e.minute}
                <span className={e.type === 'red_card' ? styles.redCard : styles.yellowCard} />
              </span>
            ))}
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
