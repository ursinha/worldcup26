import styles from './GroupTable.module.css';
import tpStyles from './ThirdPlaceTable.module.css';

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

export default function ThirdPlaceTable({ rankedThirds, teamMap }) {
  if (!rankedThirds?.length) return null;

  return (
    <div className={`${styles.group} ${tpStyles.container}`}>
      <div className={styles.groupTitle}>Melhores 3ºs Colocados</div>
      <table className={styles.table}>
        <colgroup>
          <col />
          {COLS.map((c) => <col key={c.key} style={{ width: 30 }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className={styles.teamCol}>Seleção</th>
            {COLS.map((c) => (
              <th key={c.key} className={styles.stat}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rankedThirds.map((entry, idx) => {
            const team = teamMap[entry.team_id];
            const rowClass = entry.qualifying
              ? styles.qualified
              : styles.eliminated;

            return (
              <tr key={entry.team_id} className={rowClass}>
                <td className={`${styles.teamCell} ${entry.qualifying ? styles.qualBorder : styles.elimBorder}`}>
                  <span className={tpStyles.groupBadge}>{entry.group}</span>
                  {team?.flag && (
                    <img className={styles.flag} src={team.flag} alt={team?.name_en} loading="lazy" />
                  )}
                  <span className={`${styles.teamName} ${tpStyles.teamNameTp}`}>{team?.name_en ?? `ID ${entry.team_id}`}</span>
                  {entry.isLive && <span className={tpStyles.liveDot} />}
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
