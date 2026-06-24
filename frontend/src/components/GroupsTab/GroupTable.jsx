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
  const sortedTeams = [...group.teams].sort((a, b) => {
    if (+b.pts !== +a.pts) return +b.pts - +a.pts;
    if (+b.gd !== +a.gd) return +b.gd - +a.gd;
    return +b.gf - +a.gf;
  });

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
            const isQualified = idx < 2;

            return (
              <tr key={entry.team_id} className={isQualified ? styles.qualified : ''}>
                <td style={{ padding: '0.5rem 0.25rem 0.5rem 0.6rem' }}>
                  <span className={styles.pos}>{idx + 1}</span>
                </td>
                <td className={`${styles.teamCell} ${isQualified ? styles.qualBorder : ''}`}>
                  {team?.flag && (
                    <img className={styles.flag} src={team.flag} alt={team?.name_en} loading="lazy" />
                  )}
                  <span className={styles.teamName}>{team?.name_en ?? `ID ${entry.team_id}`}</span>
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
