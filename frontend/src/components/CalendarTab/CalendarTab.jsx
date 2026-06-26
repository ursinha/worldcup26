import { useMemo } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { gameToUTC, formatBRT, todayBRT } from '../../utils/time';
import styles from './CalendarTab.module.css';

const PHASE_LABELS = {
  group:          'Grupos',
  round_of_32:    'R32',
  round_of_16:    'R16',
  quarter_finals: 'Quartas',
  semi_finals:    'Semi',
  third_place:    '3º Lugar',
  final:          'Final',
};

const PHASE_STYLE = {
  group:          'phaseGroup',
  round_of_32:    'phaseKnockout',
  round_of_16:    'phaseKnockout',
  quarter_finals: 'phaseGold',
  semi_finals:    'phaseGold',
  third_place:    'phaseFinal',
  final:          'phaseFinal',
};

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

  // Group matches by BRT date → { phases, count }
  const matchDays = useMemo(() => {
    if (!matchesData?.games) return {};
    const days = {};
    for (const game of matchesData.games) {
      const utc = gameToUTC(game.local_date, game.stadium_id);
      const { isoDate } = formatBRT(utc);
      if (!days[isoDate]) days[isoDate] = { phases: new Set(), count: 0 };
      days[isoDate].phases.add(game.type);
      days[isoDate].count += 1;
    }
    return days;
  }, [matchesData]);

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

            return (
              <div
                key={iso}
                className={`${styles.cell} ${info ? styles.hasMatches : ''} ${isToday ? styles.today : ''}`}
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
        <span className={`${styles.legendItem} ${styles.phaseGroup}`}>Grupos</span>
        <span className={`${styles.legendItem} ${styles.phaseKnockout}`}>R32 / R16</span>
        <span className={`${styles.legendItem} ${styles.phaseGold}`}>Quartas / Semi</span>
        <span className={`${styles.legendItem} ${styles.phaseFinal}`}>Final</span>
      </div>
    </div>
  );
}
