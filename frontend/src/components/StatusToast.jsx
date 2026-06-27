import { useState, useEffect } from 'react';
import styles from './GoalToast.module.css';

const KINDS = {
  winner:     { icon: '🏆', label: 'Classificada em 1º',      body: (t, g) => `${t} venceu o Grupo ${g}` },
  qualified:  { icon: '✓',  label: 'Classificada',            body: (t) => `${t} garantiu vaga nos 16 avos de final` },
  eliminated: { icon: '✗',  label: 'Eliminada',               body: (t) => `${t} está fora` },
  'proj-in':  { icon: '↗',  label: 'Classificação projetada', body: (t) => `${t} se classificaria agora (ao vivo)` },
  'proj-out': { icon: '↘',  label: 'Eliminação projetada',    body: (t) => `${t} estaria fora agora (ao vivo)` },
};

export default function StatusToast({ toasts, onDismiss }) {
  // Items only — App provides the shared fixed container.
  return toasts.map((t) => (
    <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
  ));
}

function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const x = setTimeout(() => setExiting(true), 8_000);
    return () => clearTimeout(x);
  }, []);

  const k = KINDS[toast.kind] ?? KINDS.qualified;
  const isOut = toast.kind === 'eliminated' || toast.kind === 'proj-out';
  const isProjected = toast.kind === 'proj-in' || toast.kind === 'proj-out';
  const color = isOut ? 'var(--red)' : 'var(--accent)';

  return (
    <div
      className={`${styles.toast} ${exiting ? styles.exiting : ''}`}
      style={{ borderColor: color, borderLeftStyle: isProjected ? 'dashed' : 'solid' }}
      onClick={() => onDismiss(toast.id)}
    >
      <div className={styles.header}>
        <span className={styles.goalIcon}>{k.icon}</span>
        <span className={styles.goalLabel} style={{ color }}>{k.label}</span>
      </div>
      <div className={styles.team}>{k.body(toast.team, toast.group)}</div>
    </div>
  );
}
