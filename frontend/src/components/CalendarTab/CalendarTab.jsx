import { useMemo, useState, useEffect } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { teamNamePt, matchLabelPt } from '../../utils/i18n';
import { gameToUTC, formatBRT, todayBRT } from '../../utils/time';
import styles from './CalendarTab.module.css';

const PHASE_LABELS = {
  group:  'GRUPOS',
  r32:    '16 AVOS',
  r16:    'OITAVAS',
  qf:     'QUARTAS',
  sf:     'SEMI',
  third:  '3º LUGAR',
  final:  'FINAL',
};

// Progressive importance: group < R32 < R16 < QF < SF < 3rd/final
const PHASE_STYLE = {
  group:  'phaseGroup',
  r32:    'phaseR32',
  r16:    'phaseR16',
  qf:     'phaseQF',
  sf:     'phaseSF',
  third:  'phaseFinal',
  final:  'phaseFinal',
};

// Importance rank — higher = closer to final
const PHASE_RANK = {
  group:  0,
  r32:    1,
  r16:    2,
  qf:     3,
  sf:     4,
  third:  5,
  final:  6,
};

// Cell background style keyed by highest phase
const CELL_PHASE_STYLE = {
  group:  'cellGroup',
  r32:    'cellR32',
  r16:    'cellR16',
  qf:     'cellQF',
  sf:     'cellSF',
  third:  'cellFinal',
  final:  'cellFinal',
};

const BRAZIL_NAME = 'Brazil';

// Friendly stage names for the Brazil-match tooltip
const STAGE_TITLE = {
  group: 'Fase de grupos',
  r32:   '16-avos de final',
  r16:   'Oitavas de final',
  qf:    'Quartas de final',
  sf:    'Semifinal',
  third: 'Disputa de 3º lugar',
  final: 'Final',
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
  const { data: teamsData } = usePolling('/api/teams', 60_000);

  const brazilId = useMemo(() => {
    if (!teamsData?.teams) return null;
    const t = teamsData.teams.find((t) => t.name_en === BRAZIL_NAME);
    return t?.id ?? null;
  }, [teamsData]);

  // Group matches by BRT date → { phases, count, hasBrazil, topPhase, games }
  const matchDays = useMemo(() => {
    if (!matchesData?.games) return {};
    const days = {};
    for (const game of matchesData.games) {
      const utc = gameToUTC(game.local_date, game.stadium_id);
      const { isoDate } = formatBRT(utc);
      if (!days[isoDate]) days[isoDate] = { phases: new Set(), count: 0, hasBrazil: false, topPhase: null, games: [] };
      days[isoDate].phases.add(game.type);
      days[isoDate].count += 1;
      if (!days[isoDate].topPhase || (PHASE_RANK[game.type] ?? 0) > (PHASE_RANK[days[isoDate].topPhase] ?? 0)) {
        days[isoDate].topPhase = game.type;
      }

      const brazilHome = game.home_team_name_en === BRAZIL_NAME || (brazilId && game.home_team_id === brazilId);
      const brazilAway = game.away_team_name_en === BRAZIL_NAME || (brazilId && game.away_team_id === brazilId);
      const isBrazil = brazilHome || brazilAway;
      if (isBrazil) days[isoDate].hasBrazil = true;

      days[isoDate].games.push({
        id: game.id,
        utcMs: utc ? utc.getTime() : 0,
        time: formatBRT(utc).time,
        homeName: teamNamePt(game.home_team_name_en) ?? matchLabelPt(game.home_team_label) ?? 'A definir',
        awayName: teamNamePt(game.away_team_name_en) ?? matchLabelPt(game.away_team_label) ?? 'A definir',
        stage: game.type === 'group' ? `Grupo ${game.group}` : (STAGE_TITLE[game.type] ?? game.type),
        isBrazil,
      });
    }
    for (const d of Object.values(days)) d.games.sort((a, b) => a.utcMs - b.utcMs);
    return days;
  }, [matchesData, brazilId]);

  const today = todayBRT();

  // Tap-to-show Brazil match info (mobile has no hover for the title tooltip)
  const [popover, setPopover] = useState(null);
  useEffect(() => {
    if (!popover) return;
    const close = () => setPopover(null);
    document.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [popover]);

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
                className={`${styles.cell} ${info ? styles.hasMatches : ''} ${info?.topPhase ? styles[CELL_PHASE_STYLE[info.topPhase]] || '' : ''} ${isToday ? styles.today : ''} ${info?.hasBrazil ? styles.brazil : ''} ${isPast ? styles.past : ''}`}
                onClick={(e) => {
                  if (!info?.games?.length) { setPopover(null); return; }
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  const openUp = r.top > window.innerHeight / 2;
                  setPopover((p) => (p?.iso === iso ? null : {
                    iso,
                    label: `${day} de ${MONTH_NAMES[month]}`,
                    games: info.games,
                    left: Math.min(r.left, window.innerWidth - 252),
                    ...(openUp
                      ? { bottom: window.innerHeight - r.top + 4 }
                      : { top: r.bottom + 4 }),
                  }));
                }}
              >
                {info?.hasBrazil && <span className={styles.brazilMark} aria-label="Jogo do Brasil">BRA</span>}
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
        <span className={`${styles.legendItem} ${styles.phaseR32}`}>16 AVOS</span>
        <span className={`${styles.legendItem} ${styles.phaseR16}`}>OITAVAS</span>
        <span className={`${styles.legendItem} ${styles.phaseQF}`}>QUARTAS</span>
        <span className={`${styles.legendItem} ${styles.phaseSF}`}>SEMI</span>
        <span className={`${styles.legendItem} ${styles.phaseFinal}`}>FINAL</span>
      </div>

      {popover && (
        <div
          className={styles.dayPopover}
          style={{ top: popover.top, bottom: popover.bottom, left: popover.left }}
          role="tooltip"
        >
          <div className={styles.popoverTitle}>{popover.label}</div>
          {popover.games.map((m) => (
            <div key={m.id} className={`${styles.popoverRow} ${m.isBrazil ? styles.popoverBrazil : ''}`}>
              <span className={styles.popoverTime}>{m.time}</span>
              <span className={styles.popoverTeams}>{m.homeName} × {m.awayName}</span>
              <span className={styles.popoverStage}>{m.stage}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
