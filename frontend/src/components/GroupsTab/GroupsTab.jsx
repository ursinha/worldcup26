import { useState, useEffect, useMemo } from 'react';
import { usePolling } from '../../hooks/usePolling';
import { projectStandings } from '../../utils/projectedStandings';
import { rankThirdPlaceTeams } from '../../utils/thirdPlace';
import GroupTable from './GroupTable';
import ThirdPlaceTable from './ThirdPlaceTable';
import styles from './GroupsTab.module.css';

const SUB_TABS = [
  { key: 'groups', label: 'Grupos', shortcut: 'G' },
  { key: 'thirds', label: 'Melhores 3ºs', shortcut: 'M' },
];

export default function GroupsTab() {
  const { data: groupsData, loading: groupsLoading } = usePolling('/api/groups', 15_000);
  const { data: teamsData, loading: teamsLoading } = usePolling('/api/teams', 60_000);
  const { data: matchesData } = usePolling('/api/matches', 15_000);

  const [subTab, setSubTab] = useState('groups');

  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'g' || e.key === 'G') setSubTab('groups');
      if (e.key === 'm' || e.key === 'M') setSubTab('thirds');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const teamMap = useMemo(() => {
    if (!teamsData?.teams) return {};
    return Object.fromEntries(teamsData.teams.map((t) => [t.id, t]));
  }, [teamsData]);

  const projectedGroups = useMemo(() => {
    if (!groupsData?.groups) return [];
    return projectStandings(groupsData.groups, matchesData?.games);
  }, [groupsData, matchesData]);

  const sortedGroups = useMemo(() => {
    return [...projectedGroups].sort((a, b) => a.name.localeCompare(b.name));
  }, [projectedGroups]);

  const rankedThirds = useMemo(() => {
    return rankThirdPlaceTeams(projectedGroups, matchesData?.games);
  }, [projectedGroups, matchesData]);

  if (groupsLoading || teamsLoading) {
    return <div className={styles.loading}>Carregando grupos…</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.subTabs}>
        {SUB_TABS.map(({ key, label, shortcut }) => (
          <button
            key={key}
            className={`${styles.subTab} ${subTab === key ? styles.subTabActive : ''}`}
            onClick={() => setSubTab(key)}
          >
            {label}
            <span className={styles.shortcut}>{shortcut}</span>
          </button>
        ))}
      </div>

      {subTab === 'groups' && (
        <div className={styles.grid}>
          {sortedGroups.map((group) => (
            <GroupTable key={group.name} group={group} teamMap={teamMap} />
          ))}
        </div>
      )}

      {subTab === 'thirds' && (
        <ThirdPlaceTable rankedThirds={rankedThirds} teamMap={teamMap} />
      )}
    </div>
  );
}
