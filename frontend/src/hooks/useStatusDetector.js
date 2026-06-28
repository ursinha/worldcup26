import { useState, useEffect, useRef, useCallback } from 'react';
import { usePolling } from './usePolling';
import { projectStandings } from '../utils/projectedStandings';
import { rankThirdPlaceTeams } from '../utils/thirdPlace';
import { teamNamePt } from '../utils/i18n';

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
 * Decide the winner/loser of a finished knockout match (penalties break draws).
 * Returns null when there's no clear result yet (e.g. a draw with no penalties),
 * so we don't fire a misleading toast on partial data.
 */
function decideKnockout(g) {
  const pens = g.home_penalty != null && g.away_penalty != null;
  const home = pens ? +g.home_penalty : +g.home_score;
  const away = pens ? +g.away_penalty : +g.away_score;
  if (home === away) return null;
  return home > away
    ? { winnerId: g.home_team_id, loserId: g.away_team_id }
    : { winnerId: g.away_team_id, loserId: g.home_team_id };
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
  const prevFinishedRef = useRef(null);
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
    return teamNamePt(teamsData?.teams?.find((x) => x.id === id)?.name_en) ?? `ID ${id}`;
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

  // Fire a toast when a knockout match ends: the loser is eliminated, the winner
  // advances (or is crowned champion in the final). The 3rd-place playoff is
  // skipped — both sides were already eliminated in the semifinals.
  useEffect(() => {
    if (!matchesData?.games) return;
    const knockout = matchesData.games.filter(
      (g) => g.type && g.type !== 'group' && g.type !== 'third',
    );
    const finishedMap = Object.fromEntries(
      knockout.map((g) => [g.id, g.finished === 'TRUE']),
    );
    const prev = prevFinishedRef.current;

    if (prev) {
      const fresh = [];
      for (const g of knockout) {
        if (g.finished !== 'TRUE' || prev[g.id]) continue; // not a new finish
        const res = decideKnockout(g);
        if (!res) continue;
        fresh.push(makeToast('eliminated', teamName(res.loserId), null));
        fresh.push(
          makeToast(g.type === 'final' ? 'champion' : 'advanced', teamName(res.winnerId), null),
        );
      }
      if (fresh.length) setToasts((list) => [...list, ...fresh]);
    }

    prevFinishedRef.current = finishedMap;
  }, [matchesData, teamName]);

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
