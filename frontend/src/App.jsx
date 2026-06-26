import { useState } from 'react';
import { useTheme } from './hooks/useTheme';
import { useAutoReload } from './hooks/useAutoReload';
import { useGoalDetector } from './hooks/useGoalDetector';
import StatusBar from './components/StatusBar';
import Footer from './components/Footer';
import GoalToast from './components/GoalToast';
import MatchesTab from './components/MatchesTab/MatchesTab';
import GroupsTab from './components/GroupsTab/GroupsTab';
import BracketTab from './components/BracketTab/BracketTab';
import styles from './App.module.css';

const TABS = [
  { key: 'matches', label: 'Partidas' },
  { key: 'groups', label: 'Grupos' },
  { key: 'bracket', label: 'Chaveamento' },
];

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem('wc-tab') ?? 'matches',
  );
  const { theme, toggle } = useTheme();
  useAutoReload();
  const { goals, dismiss } = useGoalDetector();

  function handleTabChange(key) {
    setActiveTab(key);
    localStorage.setItem('wc-tab', key);
  }

  return (
    <div className={styles.app}>
      <StatusBar />
      <div className={styles.tabRow}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.tab} ${activeTab === key ? styles.active : ''}`}
            onClick={() => handleTabChange(key)}
          >
            {label}
          </button>
        ))}

        <button className={styles.themeToggle} onClick={toggle} title="Alternar tema">
          <span className={styles.toggleIcon}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </span>
          {theme === 'dark' ? 'Claro' : 'Escuro'}
        </button>
      </div>

      <div className={styles.content}>
        <div style={{ display: activeTab === 'matches' ? undefined : 'none' }}><MatchesTab /></div>
        <div style={{ display: activeTab === 'groups' ? undefined : 'none' }}><GroupsTab /></div>
        <div style={{ display: activeTab === 'bracket' ? undefined : 'none' }}><BracketTab /></div>
      </div>
      <Footer />
      <GoalToast goals={goals} onDismiss={dismiss} />
    </div>
  );
}
