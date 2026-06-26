import { useState, useEffect } from 'react';
import styles from './StatusToast.module.css';

const KINDS = {
  winner:     { icon: '🏆', label: 'Classificada em 1º',     tone: 'in',      body: (t, g) => `${t} venceu o Grupo ${g}` },
  qualified:  { icon: '✓',  label: 'Classificada',           tone: 'in',      body: (t) => `${t} garantiu vaga nas oitavas` },
  eliminated: { icon: '✗',  label: 'Eliminada',              tone: 'out',     body: (t) => `${t} está fora` },
  'proj-in':  { icon: '↗',  label: 'Classificação projetada', tone: 'projin',  body: (t) => `${t} se classificaria agora (ao vivo)` },
  'proj-out': { icon: '↘',  label: 'Eliminação projetada',    tone: 'projout', body: (t) => `${t} estaria fora agora (ao vivo)` },
};

export default function StatusToast({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className={styles.container}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const x = setTimeout(() => setExiting(true), 8_000);
    return () => clearTimeout(x);
  }, []);

  const k = KINDS[toast.kind] ?? KINDS.qualified;

  return (
    <div
      className={`${styles.toast} ${styles[k.tone]} ${exiting ? styles.exiting : ''}`}
      onClick={() => onDismiss(toast.id)}
    >
      <div className={styles.header}>
        <span className={styles.icon}>{k.icon}</span>
        <span className={styles.label}>{k.label}</span>
      </div>
      <div className={styles.body}>{k.body(toast.team, toast.group)}</div>
    </div>
  );
}
