import { useState, useEffect, useRef } from 'react';
import { usePolling } from '../hooks/usePolling';
import { formatStatusTime } from '../utils/time';
import styles from './StatusBar.module.css';

function formatIn(nextPollMs) {
  if (!nextPollMs) return '—';
  const ms = nextPollMs - Date.now();
  if (ms <= 0) return 'agora';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `em ${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `em ${h}h ${rem}m` : `em ${h}h`;
}

const SOURCE_LABELS = { primary: 'Principal', live: 'Ao vivo', odds: 'Odds' };

export default function StatusBar() {
  const { data } = usePolling('/api/status', 10_000);
  const [open, setOpen]   = useState(false);
  const barRef            = useRef(null);

  const ok          = data?.ok ?? true;
  const lastUpdated = data?.lastUpdated ? formatStatusTime(data.lastUpdated) : '—';
  const errMsg      = data?.lastError ?? null;
  const sources     = data?.sources ?? {};
  const db          = data?.db ?? null;

  // Reload the page when a new deploy is detected (commit hash changed)
  const initialCommit = useRef(null);
  useEffect(() => {
    if (!data?.commit) return;
    if (initialCommit.current === null) { initialCommit.current = data.commit; return; }
    if (data.commit !== initialCommit.current) window.location.reload();
  }, [data?.commit]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (barRef.current && !barRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div className={styles.bar} ref={barRef}>
      <button
        className={`${styles.dotBtn} ${ok ? styles.ok : styles.error}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Detalhes de saúde"
      />
      <span className={styles.label}>2026 FIFA World Cup</span>
      <span className={styles.updated}>
        Última atualização: <span className={styles.time}>{lastUpdated} BRT</span>
      </span>
      {!ok && errMsg && <span className={styles.errorMsg}>{errMsg}</span>}

      {open && (
        <div className={styles.panel}>
          {Object.entries(SOURCE_LABELS).map(([key, label]) => {
            const s = sources[key] ?? {};
            const hasError = !!s.lastError;
            const hasData  = !!s.lastFetch;
            return (
              <div key={key} className={styles.sourceRow}>
                <span className={`${styles.sourceDot} ${hasError ? styles.error : hasData ? styles.ok : styles.idle}`} />
                <span className={styles.sourceName}>{label}</span>
                <span className={styles.sourceTime}>{s.lastFetch ? formatStatusTime(s.lastFetch) : '—'}</span>
                <span className={styles.sourceNext}>{formatIn(s.nextPoll)}</span>
                <span className={styles.sourceDetail}>
                  {hasError
                    ? <span className={styles.sourceErr}>{s.lastError}</span>
                    : s.calls != null ? `${s.calls.daily}h · ${s.calls.total}t` : ''}
                </span>
              </div>
            );
          })}
          {db && (
            <div className={styles.panelFooter}>
              {db.matches} partidas · {db.enriched} enriquecidas · {db.withOdds} c/ odds
              {data?.commit && <span className={styles.commit}> · {data.commit}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
