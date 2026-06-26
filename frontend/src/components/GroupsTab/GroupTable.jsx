import styles from './GroupTable.module.css';

const COLS = [
  { key: 'mp', label: 'J' },
  { key: 'w', label: 'V' },
  { key: 'd', label: 'E' },
  { key: 'l', label: 'D' },
  { key: 'gf', label: 'GP' },
  { key: 'ga', label: 'GC' },
  { key: 'gd', label: 'SG' },
  { key: 'pts', label: 'PTS' },
];

export default function GroupTable({ group, teamMap, projectedThirdIds, hasLive = false }) {
  // group.teams is already fully sorted by projectStandings (incl. head-to-head)
  const sortedTeams = group.teams;
  const groupLive = sortedTeams.some((t) => t.isLive);

  return (
    <div className={styles.group}>
      <div className={styles.groupTitle}>Grupo {group.name}</div>
      <table className={styles.table}>
        <colgroup>
          <col style={{ width: 28 }} />
          <col />
          {COLS.map((c) => <col key={c.key} style={{ width: 34 }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className={styles.teamCol} colSpan={2}>Seleção</th>
            {COLS.map((c) => (
              <th key={c.key} className={styles.stat}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((entry, idx) => {
            const team = teamMap[entry.team_id];
            const isLeading = idx < 2;          // current top-2 (provisional tint)
            const isEliminated = !!entry.eliminated; // mathematically out
            const isConfirmed = !!entry.qualified || !!entry.clinchedWinner || isEliminated;
            const isLive = !!entry.isLive;

            // Affirmative, math-backed status (independent of the upstream feed)
            let badge = null;
            if (entry.clinchedWinner) badge = { cls: styles.badgeQual, text: '1º ✓', title: 'Classificada em 1º lugar' };
            else if (entry.qualified) badge = { cls: styles.badgeQual, text: '✓', title: entry.advancedAsThird ? 'Classificada (melhor 3º lugar)' : 'Classificada' };
            else if (isEliminated)    badge = { cls: styles.badgeElim, text: '✗', title: 'Eliminada' };

            // Live projection (provisional, not confirmed): with the score as it
            // stands right now, would this team go through? Top-2 of its group, or
            // currently inside the best-8 thirds. Shown only while it can move —
            // the group is live, or a live match elsewhere is shifting the 3rd cut.
            const projectedIn = isLeading || !!projectedThirdIds?.has(entry.team_id);
            const showProjected = !isConfirmed && (groupLive || (hasLive && idx === 2));

            // Row tint: confirmed status wins; otherwise the live projection; else
            // the provisional standings leader.
            let rowClass = '';
            if (entry.qualified || entry.clinchedWinner) rowClass = styles.qualified;
            else if (isEliminated) rowClass = styles.eliminated;
            else if (showProjected) rowClass = projectedIn ? styles.projIn : styles.projOut;
            else if (isLeading) rowClass = styles.qualified;

            let borderClass = '';
            if (entry.qualified || entry.clinchedWinner || (showProjected && projectedIn) || (!showProjected && isLeading)) borderClass = styles.qualBorder;
            else if (isEliminated || (showProjected && !projectedIn)) borderClass = styles.elimBorder;

            return (
              <tr
                key={entry.team_id}
                className={`${rowClass} ${isLive ? styles.liveRow : ''}`}
              >
                <td style={{ padding: '0.5rem 0.25rem 0.5rem 0.6rem' }}>
                  <span className={styles.pos}>{idx + 1}</span>
                </td>
                <td className={`${styles.teamCell} ${borderClass}`}>
                  {team?.flag && (
                    <img className={styles.flag} src={team.flag} alt={team?.name_en} loading="lazy" />
                  )}
                  <span className={styles.teamName}>{team?.name_en ?? `ID ${entry.team_id}`}</span>
                  {badge && <span className={`${styles.statusBadge} ${badge.cls}`} title={badge.title}>{badge.text}</span>}
                  {showProjected && (
                    <span
                      className={`${styles.projTag} ${projectedIn ? styles.projTagIn : styles.projTagOut}`}
                      title={projectedIn ? 'Classificação projetada (resultado ao vivo)' : 'Eliminação projetada (resultado ao vivo)'}
                    >
                      projetado
                    </span>
                  )}
                  {isLive && <span className={styles.liveDot} />}
                </td>
                {COLS.map((c) => (
                  <td key={c.key} className={`${styles.stat} ${c.key === 'pts' ? styles.pts : ''}`}>
                    {entry[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
