import { useState, useEffect, useRef, useCallback } from 'react';
import { usePolling } from './usePolling';
import { projectStandings } from '../utils/projectedStandings';
import { rankThirdPlaceTeams } from '../utils/thirdPlace';

const TOAST_DURATION = 9_000;
let toastId = 0;

const makeToast = (kind, team, group) => ({ id: ++toastId, kind, team, group });

/**
 * Snapshot each team's qualification status from the current data.
 *   confirmed  : 'winner' | 'qualified' | 'eliminated' | null  (math-locked)
 *   projectedIn: would currently go through if live scores held (top-2 or best-8 third)
 */
function computeStatuses(groups, matches) {
  const proj = projectStandings(groups, matches);
  const ranked = rankThirdPlaceTeams(proj, matches);
  const thirdIn = new Set(ranked.filter((t) => t.qualifying).map((t) => t.team_id));
  const hasLive = proj.some((g) => g.teams.some((t) => t.isLive));

  const map = {};
  for (const g of proj) {
    g.teams.forEach((t, idx) => {
      let confirmed = null;
      if (t.clinchedWinner) confirmed = 'winner';
      else if (t.qualified) confirmed = 'qualified';
      else if (t.eliminated) confirmed = 'eliminated';
      map[t.team_id] = { confirmed, projectedIn: idx < 2 || thirdIn.has(t.team_id), group: g.name };
    });
  }
  return { map, hasLive };
}

/**
 * Fire toasts when a team's qualification status changes between polls:
 *   - confirmed clinch/elimination (math-locked) — always;
 *   - projected in/out flips while a match is live — provisional.
 * Returns { toasts, dismiss }.
 */
export function useStatusDetector() {
  const { data: matchesData } = usePolling('/api/matches', 15_000);
  const { data: groupsData } = usePolling('/api/groups', 15_000);
  const { data: teamsData } = usePolling('/api/teams', 60_000);
  const prevRef = useRef(null);
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), TOAST_DURATION));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  const teamName = useCallback((id) => {
    return teamsData?.teams?.find((x) => x.id === id)?.name_en ?? `ID ${id}`;
  }, [teamsData]);

  // Diff statuses on each poll
  useEffect(() => {
    if (!groupsData?.groups || !matchesData?.games) return;
    const { map, hasLive } = computeStatuses(groupsData.groups, matchesData.games);
    const prev = prevRef.current;

    if (prev) {
      const fresh = [];
      for (const [id, cur] of Object.entries(map)) {
        const old = prev[id];
        if (!old) continue;

        if (cur.confirmed && cur.confirmed !== old.confirmed) {
          // newly (or further) confirmed — math-locked event
          fresh.push(makeToast(cur.confirmed, teamName(id), cur.group));
        } else if (!cur.confirmed && hasLive && old.projectedIn !== cur.projectedIn) {
          // provisional projection flipped during a live match
          fresh.push(makeToast(cur.projectedIn ? 'proj-in' : 'proj-out', teamName(id), cur.group));
        }
      }
      if (fresh.length) setToasts((list) => [...list, ...fresh]);
    }

    prevRef.current = map;
  }, [groupsData, matchesData, teamName]);

  // Dev helpers: window.__testClinch('eliminated','Cape Verde','H') or ?testclinch=eliminated
  useEffect(() => {
    window.__testClinch = (kind = 'qualified', team = 'Uruguay', group = 'H') => {
      setToasts((list) => [...list, makeToast(kind, team, group)]);
    };

    const params = new URLSearchParams(window.location.search);
    if (params.has('testclinch')) {
      const v = params.get('testclinch');
      window.__testClinch(v && v !== '1' ? v : 'qualified');
      params.delete('testclinch');
      const clean = params.toString();
      window.history.replaceState({}, '', clean ? `?${clean}` : window.location.pathname);
    }

    return () => { delete window.__testClinch; };
  }, []);

  return { toasts, dismiss };
}
