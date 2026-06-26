import { usePolling } from '../hooks/usePolling';
import styles from './Footer.module.css';

export default function Footer() {
  const { data } = usePolling('/api/status', 60_000);
  const commit = data?.commit ?? '—';

  return (
    <div className={styles.footer}>
      <div className={styles.branding}>
        <svg className={styles.trophyIcon} viewBox="0 0 100 100" width="12" height="12" aria-hidden="true">
          <defs><linearGradient id="ft" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFD700"/><stop offset="100%" stopColor="#B8860B"/></linearGradient></defs>
          <path d="M30 20h40v30c0 16-10 26-20 28c-10-2-20-12-20-28z" fill="url(#ft)" stroke="#9A7400" strokeWidth="2"/>
          <path d="M30 28c-12 0-16 6-16 14s6 14 16 14" fill="none" stroke="url(#ft)" strokeWidth="5" strokeLinecap="round"/>
          <path d="M70 28c12 0 16 6 16 14s-6 14-16 14" fill="none" stroke="url(#ft)" strokeWidth="5" strokeLinecap="round"/>
          <rect x="44" y="78" width="12" height="8" rx="1" fill="#B8860B"/>
          <rect x="32" y="86" width="36" height="6" rx="3" fill="url(#ft)" stroke="#9A7400" strokeWidth="1"/>
        </svg>
        <span className={styles.championship}>FIFA World Cup 2026&#8482;</span>
      </div>
      <span className={styles.separator}>·</span>
      <span>commit</span>
      <span className={styles.commit}>{commit}</span>
    </div>
  );
}
