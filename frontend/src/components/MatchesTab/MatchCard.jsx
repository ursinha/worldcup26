import { useEffect, useRef, useState } from 'react';
import { gameToUTC, formatBRT } from '../../utils/time';
import { matchStatus, stageLabel, parseScorers, scorersFromEvents } from '../../utils/parsers';
import { resolveSlot, isGroupPlaceholderLabel } from '../../utils/bracket';
import { teamNamePt, matchLabelPt } from '../../utils/i18n';
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

function TeamSide({ name, flag, side, projected }) {
  return (
    <div className={`${styles.team} ${side === 'away' ? styles.away : ''}`}>
      {flag && <img className={styles.flag} src={flag} alt={name} loading="lazy" />}
      <span className={`${styles.teamName} ${projected ? styles.projected : ''}`}>
        {name}
        {projected && <span className={styles.projBadge}>proj</span>}
      </span>
    </div>
  );
}

export default function MatchCard({ game, teamMap, stadiumMap, gameMap, groupMap, thirdPlaceAssignment }) {
  const status = matchStatus(game);
  const isLive = status === 'live';
  const isFinished = status === 'finished';

  const homeTeam = teamMap[game.home_team_id];
  const awayTeam = teamMap[game.away_team_id];

  // Resolve from our own standings for group-placeholder slots (ignoring the
  // feed's pre-filled id) and whenever the team name is absent — so the card
  // agrees with the Groups tab and the bracket.
  const homeGroupSlot = isGroupPlaceholderLabel(game.home_team_label);
  const awayGroupSlot = isGroupPlaceholderLabel(game.away_team_label);
  const homeResolved = ((homeGroupSlot || !game.home_team_name_en) && gameMap && groupMap)
    ? resolveSlot(game.home_team_id, game.home_team_label, gameMap, groupMap, teamMap, 0, { thirdPlaceAssignment, currentMatchId: game.id })
    : null;
  const awayResolved = ((awayGroupSlot || !game.away_team_name_en) && gameMap && groupMap)
    ? resolveSlot(game.away_team_id, game.away_team_label, gameMap, groupMap, teamMap, 0, { thirdPlaceAssignment, currentMatchId: game.id })
    : null;

  const homeProjected = homeResolved?.projected && !!homeResolved?.team;
  const awayProjected = awayResolved?.projected && !!awayResolved?.team;
  // For group-placeholder slots our resolution wins over the feed's pre-fill.
  const homeName = (homeGroupSlot
    ? teamNamePt(homeResolved?.team?.name_en)
    : teamNamePt(game.home_team_name_en) ?? teamNamePt(homeResolved?.team?.name_en)
  ) ?? matchLabelPt(game.home_team_label) ?? '?';
  const awayName = (awayGroupSlot
    ? teamNamePt(awayResolved?.team?.name_en)
    : teamNamePt(game.away_team_name_en) ?? teamNamePt(awayResolved?.team?.name_en)
  ) ?? matchLabelPt(game.away_team_label) ?? '?';
  const homeFlag = homeGroupSlot ? homeResolved?.team?.flag : (homeTeam?.flag ?? homeResolved?.team?.flag);
  const awayFlag = awayGroupSlot ? awayResolved?.team?.flag : (awayTeam?.flag ?? awayResolved?.team?.flag);
  const stadium  = stadiumMap[game.stadium_id];

  const utcDate = gameToUTC(game.local_date, game.stadium_id);
  const { date: brtDate, time: kickoffBRT } = formatBRT(utcDate);
  const shortDate = brtDate.slice(0, 5); // "23/06"

  // Scorers from ESPN events (single source, consistent with the score). Fall
  // back to the primary feed's strings only when ESPN hasn't enriched the match.
  const showScorers = isFinished || isLive;
  const evScorers   = scorersFromEvents(game.events);
  const useEvents   = game.enriched_at != null;
  const homeScorers = showScorers ? (useEvents ? evScorers.home : parseScorers(game.home_scorers)) : [];
  const awayScorers = showScorers ? (useEvents ? evScorers.away : parseScorers(game.away_scorers)) : [];
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
        <span>
          {game.type === 'group'
            ? `Grupo ${game.group} · ${shortDate}`
            : stageLabel(game)}
        </span>
        {isLive && (
          <span className={styles.liveBadge}>
            <span className={styles.liveDot} />
            AO VIVO
          </span>
        )}
        {isFinished && <span>Encerrado · {kickoffBRT}</span>}
      </div>

      {/* Teams + Score/Time */}
      <div className={styles.teams}>
        <TeamSide name={homeName} flag={homeFlag} side="home" projected={homeProjected} />

        <div className={styles.scoreOrTime}>
          {isFinished || isLive ? (
            <>
              <span className={`${styles.score} ${scorePulse ? styles.scorePulse : ''}`}>
                {game.home_score} – {game.away_score}
              </span>
              {game.home_penalty != null && game.away_penalty != null && (
                <span className={styles.penaltyLine}>({game.home_penalty} – {game.away_penalty}) pen</span>
              )}
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

        <TeamSide name={awayName} flag={awayFlag} side="away" projected={awayProjected} />
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

      {/* Prediction — upcoming and live only */}
      {status !== 'finished' && game.pred_scores && (
        <div className={styles.prediction}>
          <div className={styles.predHeader}>
            <span className={styles.predLabel}>Placar estimado</span>
            <div className={styles.predScores}>
              {game.pred_scores.slice(0, 3).map((s, i) => (
                <span key={i} className={`${styles.predScore} ${i === 0 ? styles.predTop : ''}`}>
                  {s.home}–{s.away} <span className={styles.predProb}>{s.prob}%</span>
                </span>
              ))}
            </div>
          </div>
          <div className={styles.predOutcomes}>
            <span className={styles.predWinHome}>{game.win_home}%</span>
            <span className={styles.predWinDraw}>Empate {game.win_draw}%</span>
            <span className={styles.predWinAway}>{game.win_away}%</span>
          </div>
          <div className={styles.predBarTrack}>
            <div className={styles.predBarHome} style={{ width: `${game.win_home}%` }} />
            <div className={styles.predBarDraw} style={{ width: `${game.win_draw}%` }} />
            <div className={styles.predBarAway} style={{ width: `${game.win_away}%` }} />
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
