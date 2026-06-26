import { useState, useEffect } from 'react';
import styles from './GoalToast.module.css';

export default function GoalToast({ goals, onDismiss }) {
  // Items only — the fixed container is provided by App so goal and status
  // toasts share one stack.
  return goals.map((goal) => (
    <ToastItem key={goal.id} goal={goal} onDismiss={onDismiss} />
  ));
}

function ToastItem({ goal, onDismiss }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setExiting(true), 6500); // start exit anim before dismiss
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={`${styles.toast} ${exiting ? styles.exiting : ''}`}
      onClick={() => onDismiss(goal.id)}
    >
      <div className={styles.confetti} aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className={styles.particle} style={{ '--i': i }} />
        ))}
      </div>
      <div className={styles.header}>
        <span className={styles.goalIcon}>⚽</span>
        <span className={styles.goalLabel}>GOL!</span>
      </div>
      <div className={styles.team}>{goal.teamName}</div>
      {goal.scorer && <div className={styles.scorer}>{goal.scorer}</div>}
      <div className={styles.scoreLine}>
        {goal.homeName} {goal.homeScore} – {goal.awayScore} {goal.awayName}
      </div>
    </div>
  );
}
