import { isGroupComplete } from '../../utils/projectedStandings';
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

export default function GroupTable({ group, teamMap }) {
  // group.teams is already fully sorted by projectStandings (incl. head-to-head)
  const sortedTeams = group.teams;

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
          {(() => {
            const groupDone = isGroupComplete(sortedTeams);
            const thirdPts  = +(sortedTeams[2]?.pts ?? 0);
            return sortedTeams.map((entry, idx) => {
            const team = teamMap[entry.team_id];
            const isQualified = idx < 2;
            const maxPts = +entry.pts + Math.max(0, 3 - (+entry.mp || 0)) * 3;
            // Eliminated when group is fully played (groupDone covers ties on pts/GD)
            // or when they mathematically can't reach 3rd's current points
            const isEliminated = idx === 3 && (groupDone || maxPts < thirdPts);
            const isLive = !!entry.isLive;

            return (
              <tr
                key={entry.team_id}
                className={`${isQualified ? styles.qualified : isEliminated ? styles.eliminated : ''} ${isLive ? styles.liveRow : ''}`}
              >
                <td style={{ padding: '0.5rem 0.25rem 0.5rem 0.6rem' }}>
                  <span className={styles.pos}>{idx + 1}</span>
                </td>
                <td className={`${styles.teamCell} ${isQualified ? styles.qualBorder : isEliminated ? styles.elimBorder : ''}`}>
                  {team?.flag && (
                    <img className={styles.flag} src={team.flag} alt={team?.name_en} loading="lazy" />
                  )}
                  <span className={styles.teamName}>{team?.name_en ?? `ID ${entry.team_id}`}</span>
                  {isLive && <span className={styles.liveDot} />}
                </td>
                {COLS.map((c) => (
                  <td key={c.key} className={`${styles.stat} ${c.key === 'pts' ? styles.pts : ''}`}>
                    {entry[c.key]}
                  </td>
                ))}
              </tr>
            );
            });
          })()}
        </tbody>
      </table>
    </div>
  );
}
