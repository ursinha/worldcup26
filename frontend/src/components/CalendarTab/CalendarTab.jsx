import { useMemo } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { gameToUTC, formatBRT, todayBRT } from '../../utils/time';
import styles from './CalendarTab.module.css';

const PHASE_LABELS = {
  group:          'GRUPOS',
  round_of_32:    'R32',
  round_of_16:    'OITAVAS',
  quarter_finals: 'QUARTAS',
  semi_finals:    'SEMI',
  third_place:    '3º LUGAR',
  final:          'FINAL',
};

// Progressive importance: group < R32 < R16 < QF < SF < 3rd/final
const PHASE_STYLE = {
  group:          'phaseGroup',
  round_of_32:    'phaseR32',
  round_of_16:    'phaseR16',
  quarter_finals: 'phaseQF',
  semi_finals:    'phaseSF',
  third_place:    'phaseFinal',
  final:          'phaseFinal',
};

const BRAZIL_NAME = 'Brazil';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = [];
  let week = new Array(firstDay).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function CalendarTab() {
  const { data: matchesData, loading } = usePolling('/api/matches', 60_000);
  const { data: teamsData } = usePolling('/api/teams', 60_000);

  const brazilId = useMemo(() => {
    if (!teamsData?.teams) return null;
    const t = teamsData.teams.find((t) => t.name_en === BRAZIL_NAME);
    return t?.id ?? null;
  }, [teamsData]);

  // Group matches by BRT date → { phases, count, hasBrazil }
  const matchDays = useMemo(() => {
    if (!matchesData?.games) return {};
    const days = {};
    for (const game of matchesData.games) {
      const utc = gameToUTC(game.local_date, game.stadium_id);
      const { isoDate } = formatBRT(utc);
      if (!days[isoDate]) days[isoDate] = { phases: new Set(), count: 0, hasBrazil: false };
      days[isoDate].phases.add(game.type);
      days[isoDate].count += 1;
      if (
        game.home_team_name_en === BRAZIL_NAME ||
        game.away_team_name_en === BRAZIL_NAME ||
        (brazilId && (game.home_team_id === brazilId || game.away_team_id === brazilId))
      ) {
        days[isoDate].hasBrazil = true;
      }
    }
    return days;
  }, [matchesData, brazilId]);

  const today = todayBRT();

  if (loading) return <div className={styles.loading}>Carregando calendário…</div>;

  function renderMonth(year, month) {
    const weeks = buildMonthGrid(year, month);
    const monthLabel = `${MONTH_NAMES[month]} ${year}`;

    return (
      <div className={styles.month} key={`${year}-${month}`}>
        <div className={styles.monthTitle}>{monthLabel}</div>
        <div className={styles.grid}>
          {WEEKDAYS.map((wd) => (
            <div key={wd} className={styles.weekday}>{wd}</div>
          ))}
          {weeks.flat().map((day, i) => {
            if (day === null) return <div key={`e${i}`} className={styles.emptyCell} />;

            const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const info = matchDays[iso];
            const isToday = iso === today;
            const isPast = iso < today;

            return (
              <div
                key={iso}
                className={`${styles.cell} ${info ? styles.hasMatches : ''} ${isToday ? styles.today : ''} ${info?.hasBrazil ? styles.brazil : ''} ${isPast ? styles.past : ''}`}
              >
                <span className={styles.dayNum}>{day}</span>
                {info && (
                  <div className={styles.badges}>
                    {[...info.phases].map((phase) => (
                      <span key={phase} className={`${styles.badge} ${styles[PHASE_STYLE[phase]] || ''}`}>
                        {PHASE_LABELS[phase] || phase}
                      </span>
                    ))}
                    <span className={styles.matchCount}>{info.count}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.months}>
        {renderMonth(2026, 5)}
        {renderMonth(2026, 6)}
      </div>
      <div className={styles.legend}>
        <span className={`${styles.legendItem} ${styles.phaseGroup}`}>GRUPOS</span>
        <span className={`${styles.legendItem} ${styles.phaseR32}`}>R32</span>
        <span className={`${styles.legendItem} ${styles.phaseR16}`}>OITAVAS</span>
        <span className={`${styles.legendItem} ${styles.phaseQF}`}>QUARTAS</span>
        <span className={`${styles.legendItem} ${styles.phaseSF}`}>SEMI</span>
        <span className={`${styles.legendItem} ${styles.phaseFinal}`}>FINAL</span>
        <span className={`${styles.legendItem} ${styles.legendBrazil}`}>Brasil</span>
      </div>
    </div>
  );
}
