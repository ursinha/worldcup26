import { useState, useMemo } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { gameToUTC, formatBRT, todayBRT } from '../../utils/time';
import { matchStatus } from '../../utils/parsers';
import MatchCard from './MatchCard';
import styles from './MatchesTab.module.css';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'live', label: 'Ao Vivo' },
  { key: 'today', label: 'Hoje' },
  { key: 'upcoming', label: 'Próximos' },
  { key: 'finished', label: 'Encerrados' },
];

export default function MatchesTab() {
  const [filter, setFilter] = useState('all');

  const { data: matchesData, loading: matchesLoading } = usePolling('/api/matches', 15_000);
  const { data: teamsData } = usePolling('/api/teams', 60_000);
  const { data: stadiumsData } = usePolling('/api/stadiums', 300_000);

  // Build lookup maps
  const teamMap = useMemo(() => {
    if (!teamsData?.teams) return {};
    return Object.fromEntries(teamsData.teams.map((t) => [t.id, t]));
  }, [teamsData]);

  const stadiumMap = useMemo(() => {
    if (!stadiumsData?.stadiums) return {};
    return Object.fromEntries(stadiumsData.stadiums.map((s) => [s.id, s]));
  }, [stadiumsData]);

  // Filter + sort games
  const today = todayBRT();

  const filteredGames = useMemo(() => {
    if (!matchesData?.games) return [];

    return matchesData.games.filter((game) => {
      const status = matchStatus(game);
      const utc = gameToUTC(game.local_date, game.stadium_id);
      const { isoDate } = formatBRT(utc);

      switch (filter) {
        case 'live':
          return status === 'live';
        case 'today':
          return isoDate === today;
        case 'upcoming':
          return status === 'notstarted';
        case 'finished':
          return status === 'finished';
        default:
          return true;
      }
    });
  }, [matchesData, filter, today]);

  // Group by BRT date, sorted chronologically
  const groupedByDate = useMemo(() => {
    const groups = {};
    for (const game of filteredGames) {
      const utc = gameToUTC(game.local_date, game.stadium_id);
      const { isoDate, date, weekday } = formatBRT(utc);
      if (!groups[isoDate]) groups[isoDate] = { isoDate, label: `${weekday}, ${date}`, games: [] };
      groups[isoDate].games.push({ game, utc });
    }

    // Sort groups by date, games within each group by time
    return Object.values(groups)
      .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
      .map((g) => ({
        ...g,
        games: g.games.sort((a, b) => a.utc - b.utc).map((x) => x.game),
      }));
  }, [filteredGames]);

  if (matchesLoading) {
    return <div className={styles.loading}>Carregando partidas…</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.filters}>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.filterBtn} ${filter === key ? styles.active : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {groupedByDate.length === 0 && (
        <div className={styles.empty}>Nenhuma partida encontrada.</div>
      )}

      {groupedByDate.map(({ isoDate, label, games }) => (
        <div key={isoDate} className={styles.dateGroup}>
          <div className={styles.dateHeading}>{label}</div>
          <div className={styles.cards}>
            {games.map((game) => (
              <MatchCard
                key={game.id}
                game={game}
                teamMap={teamMap}
                stadiumMap={stadiumMap}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
