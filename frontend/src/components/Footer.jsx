import { usePolling } from '../hooks/usePolling';
import styles from './Footer.module.css';

export default function Footer() {
  const { data } = usePolling('/api/status', 60_000);
  const commit = data?.commit ?? '—';

  return (
    <div className={styles.footer}>
      <span>commit</span>
      <span className={styles.commit}>{commit}</span>
    </div>
  );
}
