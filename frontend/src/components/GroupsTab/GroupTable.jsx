import { teamNamePt } from '../../utils/i18n';
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

            // Live projection (provisional, not confirmed): with the score as it
            // stands right now, would this team go through? Top-2 of its group, or
            // currently inside the best-8 thirds. Shown only while it can move —
            // the group is live, or a live match elsewhere is shifting the 3rd cut.
            const projectedIn = isLeading || !!projectedThirdIds?.has(entry.team_id);
            const showProjected = !isConfirmed && (groupLive || (hasLive && idx === 2));

            // Encode status with the row tint + left-border (no inline chip, so
            // team names stay full): solid border = confirmed (math-locked),
            // dashed = live projection; green = in, red = out, gold = group winner.
            let rowClass = '', borderClass = '', statusTitle = '';
            if (entry.clinchedWinner)               { rowClass = styles.qualified;  borderClass = styles.winBorder;     statusTitle = 'Classificada em 1º lugar'; }
            else if (entry.qualified)               { rowClass = styles.qualified;  borderClass = styles.qualBorder;    statusTitle = entry.advancedAsThird ? 'Classificada (melhor 3º lugar)' : 'Classificada'; }
            else if (isEliminated)                  { rowClass = styles.eliminated; borderClass = styles.elimBorder;    statusTitle = 'Eliminada'; }
            else if (showProjected && projectedIn)  { rowClass = styles.projIn;     borderClass = styles.projInBorder;  statusTitle = 'Classificação projetada (resultado ao vivo)'; }
            else if (showProjected && !projectedIn) { rowClass = styles.projOut;    borderClass = styles.projOutBorder; statusTitle = 'Eliminação projetada (resultado ao vivo)'; }
            else if (isLeading)                     { rowClass = styles.leading;    borderClass = styles.qualBorder;    statusTitle = 'Entre os 2 primeiros (provisório)'; }

            return (
              <tr
                key={entry.team_id}
                className={`${rowClass} ${isLive ? styles.liveRow : ''}`}
              >
                <td style={{ padding: '0.5rem 0.25rem 0.5rem 0.6rem' }}>
                  <span className={styles.pos}>{idx + 1}</span>
                </td>
                <td className={`${styles.teamCell} ${borderClass}`} title={statusTitle || undefined}>
                  {team?.flag && (
                    <img className={styles.flag} src={team.flag} alt={teamNamePt(team?.name_en)} loading="lazy" />
                  )}
                  <span className={styles.teamName}>{teamNamePt(team?.name_en) ?? `ID ${entry.team_id}`}</span>
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
