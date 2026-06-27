import { useState, useEffect, useMemo, useRef } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { gameToUTC, formatBRT, todayBRT } from '../../utils/time';
import { matchStatus } from '../../utils/parsers';
import { resolveSlot } from '../../utils/bracket';
import { projectStandings } from '../../utils/projectedStandings';
import { rankThirdPlaceTeams, resolveThirdPlaceSlots } from '../../utils/thirdPlace';
import { teamNamePt, normalizeText } from '../../utils/i18n';
import MatchCard from './MatchCard';
import styles from './MatchesTab.module.css';

const FILTERS = [
  { key: 'live',     label: 'Ao Vivo' },
  { key: 'today',    label: 'Hoje' },
  { key: 'upcoming', label: 'Próximos' },
  { key: 'finished', label: 'Encerrados' },
  { key: 'all',      label: 'Todos' },
];

function buildDateGroups(games, reverse = false) {
  const groups = {};
  for (const game of games) {
    const utc = gameToUTC(game.local_date, game.stadium_id);
    const { isoDate, date, weekday } = formatBRT(utc);
    if (!groups[isoDate]) groups[isoDate] = { isoDate, label: `${weekday}, ${date}`, games: [] };
    groups[isoDate].games.push({ game, utc });
  }
  return Object.values(groups)
    .sort((a, b) => reverse ? b.isoDate.localeCompare(a.isoDate) : a.isoDate.localeCompare(b.isoDate))
    .map((g) => ({
      ...g,
      games: g.games.sort((a, b) => reverse ? b.utc - a.utc : a.utc - b.utc).map((x) => x.game),
    }));
}

export default function MatchesTab() {
  const savedFilter = localStorage.getItem('wc-matches-filter');
  const [filter, setFilterRaw] = useState(savedFilter ?? 'live');
  const [query, setQuery] = useState('');
  const [matchInterval, setMatchInterval] = useState(15_000);
  const initialFilterSet = useRef(!!savedFilter);

  function setFilter(key) {
    setFilterRaw(key);
    localStorage.setItem('wc-matches-filter', key);
  }

  const { data: matchesData, loading: matchesLoading } = usePolling('/api/matches', matchInterval);

  const hasLive = useMemo(() => {
    if (!matchesData?.games) return false;
    return matchesData.games.some(
      (g) => g.finished === 'FALSE' && g.time_elapsed !== 'notstarted',
    );
  }, [matchesData]);

  // Speed up polling to 5s while any match is live
  useEffect(() => {
    if (!matchesData?.games) return;
    setMatchInterval(hasLive ? 5_000 : 15_000);

    // Set default filter once on first load (only if no saved preference)
    if (!initialFilterSet.current) {
      initialFilterSet.current = true;
      if (!hasLive) setFilter('today');
    }

    // Fall back from live filter when no matches are live
    if (filter === 'live' && !hasLive) setFilter('today');
  }, [matchesData]);
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

  const { data: groupsData } = usePolling('/api/groups', 15_000);

  const gameMap = useMemo(() => {
    if (!matchesData?.games) return {};
    return Object.fromEntries(matchesData.games.map((g) => [g.id, g]));
  }, [matchesData]);

  const projectedGroups = useMemo(() => {
    if (!groupsData?.groups) return [];
    return projectStandings(groupsData.groups, matchesData?.games);
  }, [groupsData, matchesData]);

  const groupMap = useMemo(() => {
    if (!projectedGroups.length) return {};
    return Object.fromEntries(projectedGroups.map((g) => [g.name, g]));
  }, [projectedGroups]);

  const thirdPlaceAssignment = useMemo(() => {
    const ranked = rankThirdPlaceTeams(projectedGroups, matchesData?.games);
    const qualifyingGroups = ranked.filter((t) => t.qualifying).map((t) => t.group);
    if (qualifyingGroups.length !== 8) return null;
    return resolveThirdPlaceSlots(qualifyingGroups);
  }, [projectedGroups, matchesData]);

  // Filter + sort games
  const today = todayBRT();
  const trimmedQuery = query.trim();
  const searching = trimmedQuery.length > 0;

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

  const statusOrder = (game) => {
    const s = matchStatus(game);
    if (s === 'live')       return 0;
    if (s === 'notstarted') return 1;
    return 2;
  };

  // For the "all" tab: two separate sorted sections
  const allSections = useMemo(() => {
    if (filter !== 'all') return null;
    const finished = filteredGames.filter((g) => matchStatus(g) === 'finished');
    const rest     = filteredGames.filter((g) => matchStatus(g) !== 'finished');
    return {
      finishedGroups: buildDateGroups(finished, true),
      upcomingGroups: buildDateGroups(rest, false),
    };
  }, [filteredGames, filter]);

  // For all other tabs: single sorted list of date groups
  const groupedByDate = useMemo(() => {
    if (filter === 'all') return [];

    const reverseDate = filter === 'finished';

    if (filter === 'today') {
      // Today: group all games, sort live→upcoming→finished within each day;
      // finished sub-section sorted reverse-chronologically
      const groups = {};
      for (const game of filteredGames) {
        const utc = gameToUTC(game.local_date, game.stadium_id);
        const { isoDate, date, weekday } = formatBRT(utc);
        if (!groups[isoDate]) groups[isoDate] = { isoDate, label: `${weekday}, ${date}`, games: [] };
        groups[isoDate].games.push({ game, utc });
      }
      return Object.values(groups)
        .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
        .map((g) => ({
          ...g,
          games: g.games.sort((a, b) => {
            const diff = statusOrder(a.game) - statusOrder(b.game);
            if (diff !== 0) return diff;
            if (matchStatus(a.game) === 'finished') return b.utc - a.utc;
            return a.utc - b.utc;
          }).map((x) => x.game),
        }));
    }

    return buildDateGroups(filteredGames, reverseDate);
  }, [filteredGames, filter]);

  // Team search: when active, show all of that team's matches across the
  // tournament (chronological), overriding the status filter. Matches on the
  // English name and its pt-BR form, accent-insensitive.
  const searchGroups = useMemo(() => {
    if (!searching || !matchesData?.games) return [];
    const q = normalizeText(trimmedQuery);
    const matches = matchesData.games.filter((game) =>
      [game.home_team_name_en, game.away_team_name_en].some(
        (n) => n && (normalizeText(n).includes(q) || normalizeText(teamNamePt(n)).includes(q)),
      ),
    );
    return buildDateGroups(matches, false);
  }, [searching, trimmedQuery, matchesData]);

  const renderDateGroups = (groups, keyPrefix = '') => groups.map(({ isoDate, label, games }) => (
    <div key={`${keyPrefix}${isoDate}`} className={styles.dateGroup}>
      <div className={styles.dateHeading}>{label}</div>
      <div className={styles.cards}>
        {games.map((game) => (
          <MatchCard key={game.id} game={game} teamMap={teamMap} stadiumMap={stadiumMap} gameMap={gameMap} groupMap={groupMap} thirdPlaceAssignment={thirdPlaceAssignment} />
        ))}
      </div>
    </div>
  ));

  if (matchesLoading) {
    return <div className={styles.loading}>Carregando partidas…</div>;
  }

  const isEmpty = searching
    ? searchGroups.length === 0
    : filter === 'all'
      ? allSections.finishedGroups.length === 0 && allSections.upcomingGroups.length === 0
      : groupedByDate.length === 0;

  return (
    <div className={styles.container}>
      <div className={styles.filters}>
        {FILTERS.filter(({ key }) => key !== 'live' || hasLive).map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.filterBtn} ${!searching && filter === key ? styles.active : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar seleção…"
          aria-label="Buscar seleção"
        />
      </div>

      {isEmpty && (
        <div className={styles.empty}>
          {searching ? `Nenhuma partida encontrada para “${trimmedQuery}”.` : 'Nenhuma partida encontrada.'}
        </div>
      )}

      {searching ? (
        renderDateGroups(searchGroups, 'search-')
      ) : filter === 'all' && allSections ? (
        <>
          {renderDateGroups(allSections.finishedGroups, 'fin-')}
          {allSections.upcomingGroups.length > 0 && allSections.finishedGroups.length > 0 && (
            <div className={styles.sectionDivider}>Próximas</div>
          )}
          {renderDateGroups(allSections.upcomingGroups, 'upc-')}
        </>
      ) : (
        groupedByDate.map(({ isoDate, label, games }) => {
          const active   = filter === 'today' ? games.filter((g) => matchStatus(g) !== 'finished') : games;
          const finished = filter === 'today' ? games.filter((g) => matchStatus(g) === 'finished') : [];

          return (
            <div key={isoDate} className={styles.dateGroup}>
              <div className={styles.dateHeading}>{label}</div>
              <div className={styles.cards}>
                {active.map((game) => (
                  <MatchCard key={game.id} game={game} teamMap={teamMap} stadiumMap={stadiumMap} gameMap={gameMap} groupMap={groupMap} thirdPlaceAssignment={thirdPlaceAssignment} />
                ))}
                {finished.length > 0 && (
                  <>
                    <div className={styles.sectionDivider}>Encerradas</div>
                    {finished.map((game) => (
                      <MatchCard key={game.id} game={game} teamMap={teamMap} stadiumMap={stadiumMap} gameMap={gameMap} groupMap={groupMap} thirdPlaceAssignment={thirdPlaceAssignment} />
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
