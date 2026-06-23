import { usePolling } from '../hooks/usePolling';
import { formatStatusTime } from '../utils/time';
import styles from './StatusBar.module.css';

export default function StatusBar() {
  const { data } = usePolling('/api/status', 10_000);

  const ok = data?.ok ?? true;
  const lastUpdated = data?.lastUpdated ? formatStatusTime(data.lastUpdated) : '—';
  const errMsg = data?.lastError ?? null;

  return (
    <div className={styles.bar}>
      <span className={`${styles.dot} ${ok ? styles.ok : styles.error}`} />
      <span className={styles.label}>2026 FIFA World Cup</span>
      <span className={styles.sep}>·</span>
      <span>Última atualização: <span className={styles.time}>{lastUpdated} BRT</span></span>
      {!ok && errMsg && (
        <>
          <span className={styles.sep}>·</span>
          <span className={styles.errorMsg}>{errMsg}</span>
        </>
      )}
    </div>
  );
}
