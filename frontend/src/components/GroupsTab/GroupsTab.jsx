import { useMemo } from 'react';
import { usePolling } from '../../hooks/usePolling';
import GroupTable from './GroupTable';
import styles from './GroupsTab.module.css';

export default function GroupsTab() {
  const { data: groupsData, loading: groupsLoading } = usePolling('/api/groups', 15_000);
  const { data: teamsData } = usePolling('/api/teams', 60_000);

  const teamMap = useMemo(() => {
    if (!teamsData?.teams) return {};
    return Object.fromEntries(teamsData.teams.map((t) => [t.id, t]));
  }, [teamsData]);

  const sortedGroups = useMemo(() => {
    if (!groupsData?.groups) return [];
    return [...groupsData.groups].sort((a, b) => a.name.localeCompare(b.name));
  }, [groupsData]);

  if (groupsLoading) {
    return <div className={styles.loading}>Carregando grupos…</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {sortedGroups.map((group) => (
          <GroupTable key={group.name} group={group} teamMap={teamMap} />
        ))}
      </div>
    </div>
  );
}
