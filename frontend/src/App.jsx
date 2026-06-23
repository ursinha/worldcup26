import { useState } from 'react';
import StatusBar from './components/StatusBar';
import MatchesTab from './components/MatchesTab/MatchesTab';
import GroupsTab from './components/GroupsTab/GroupsTab';
import styles from './App.module.css';

const TABS = [
  { key: 'matches', label: 'Partidas' },
  { key: 'groups', label: 'Grupos' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('matches');

  return (
    <div className={styles.app}>
      <StatusBar />
      <div className={styles.tabs}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            className={`${styles.tab} ${activeTab === key ? styles.active : ''}`}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.content}>
        {activeTab === 'matches' ? <MatchesTab /> : <GroupsTab />}
      </div>
    </div>
  );
}
