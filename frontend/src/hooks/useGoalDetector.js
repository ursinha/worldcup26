import { useState, useEffect, useRef, useCallback } from 'react';
import { usePolling } from './usePolling';
import { teamNamePt } from '../utils/i18n';

const TOAST_DURATION = 8_000;
const TITLE_FLASH_INTERVAL = 2_000;
const TITLE_FLASH_MAX = 30_000;

let goalIdCounter = 0;

// Stable key for a goal event so we can tell new ones from already-seen ones.
const goalKey = (e) => `${e.type}|${e.team}|${e.player ?? ''}|${e.minute ?? ''}`;

/**
 * Detect new goals from ESPN goal events between polls (the scorer travels with
 * the goal, so the team/score/scorer are always consistent — no cross-source lag).
 * Returns { goals, dismiss } where goals is an array of active notifications.
 */
export function useGoalDetector() {
  const { data } = usePolling('/api/matches', 15_000);
  const prevGoalsRef = useRef(null); // { matchId: Set<goalKey> }
  const [goals, setGoals] = useState([]);
  const originalTitleRef = useRef(document.title);
  const titleTimerRef = useRef(null);

  // Dismiss a goal notification
  const dismiss = useCallback((id) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  // Auto-dismiss after TOAST_DURATION
  useEffect(() => {
    if (goals.length === 0) return;
    const timers = goals.map((g) =>
      setTimeout(() => dismiss(g.id), TOAST_DURATION),
    );
    return () => timers.forEach(clearTimeout);
  }, [goals, dismiss]);

  // Title flash when there are active goals
  useEffect(() => {
    if (goals.length === 0) {
      document.title = originalTitleRef.current;
      if (titleTimerRef.current) clearInterval(titleTimerRef.current);
      return;
    }

    const latest = goals[goals.length - 1];
    const goalTitle = `⚽ GOL! ${latest.teamName}`;
    let showGoal = true;
    const startTime = Date.now();

    titleTimerRef.current = setInterval(() => {
      if (Date.now() - startTime > TITLE_FLASH_MAX) {
        document.title = originalTitleRef.current;
        clearInterval(titleTimerRef.current);
        return;
      }
      document.title = showGoal ? goalTitle : originalTitleRef.current;
      showGoal = !showGoal;
    }, TITLE_FLASH_INTERVAL);

    // Stop flashing when tab gains focus
    function onFocus() {
      document.title = originalTitleRef.current;
      clearInterval(titleTimerRef.current);
    }
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(titleTimerRef.current);
      document.title = originalTitleRef.current;
      window.removeEventListener('focus', onFocus);
    };
  }, [goals]);

  // Detect new goals from ESPN goal events on each poll
  useEffect(() => {
    if (!data?.games) return;

    // Per match: map of goalKey → toast payload (built from the goal event)
    const current = {};
    for (const game of data.games) {
      const m = new Map();
      const homeName = teamNamePt(game.home_team_name_en);
      const awayName = teamNamePt(game.away_team_name_en);
      for (const e of game.events ?? []) {
        if (e.shootout || (e.type !== 'goal' && e.type !== 'own_goal')) continue;
        // ESPN reports `team` as the side the goal counts for (benefiting side
        // for own goals).
        const side = e.team;
        const scorer = `${e.player ?? '?'} ${e.minute ?? ''}`.trim() + (e.type === 'own_goal' ? ' (GC)' : '');
        m.set(goalKey(e), {
          matchId: game.id,
          teamName: side === 'home' ? homeName : awayName,
          scorer,
          homeScore: +game.home_score || 0,
          awayScore: +game.away_score || 0,
          homeName,
          awayName,
        });
      }
      current[game.id] = m;
    }

    const prev = prevGoalsRef.current;
    if (prev) {
      const newGoals = [];
      for (const [matchId, m] of Object.entries(current)) {
        const seen = prev[matchId];
        if (!seen) continue; // newly-appeared match — baseline it, don't fire
        for (const [key, payload] of m) {
          if (!seen.has(key)) newGoals.push({ id: ++goalIdCounter, ...payload });
        }
      }
      if (newGoals.length > 0) {
        setGoals((g) => [...g, ...newGoals]);
        fireNotifications(newGoals);
      }
    }

    prevGoalsRef.current = Object.fromEntries(
      Object.entries(current).map(([id, m]) => [id, new Set(m.keys())]),
    );
  }, [data]);

  // Dev helper: call window.__testGoal() in the console to trigger a fake toast
  useEffect(() => {
    window.__testGoal = (teamName = 'Brazil', scorer = 'Vini Jr. 73\'') => {
      const fake = {
        id: ++goalIdCounter,
        matchId: 'test',
        teamName,
        scorer,
        homeScore: 1,
        awayScore: 0,
        homeName: teamName,
        awayName: 'Argentina',
      };
      setGoals((prev) => [...prev, fake]);
      fireNotifications([fake]);
    };

    // URL trigger: add ?testgoal=1 to fire a test toast on load
    const params = new URLSearchParams(window.location.search);
    if (params.has('testgoal')) {
      window.__testGoal();
      // Clean URL without reloading
      params.delete('testgoal');
      const clean = params.toString();
      window.history.replaceState({}, '', clean ? `?${clean}` : window.location.pathname);
    }

    return () => { delete window.__testGoal; };
  }, []);

  return { goals, dismiss };
}

/**
 * Fire browser notifications for new goals.
 */
function fireNotifications(goals) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'default') {
    Notification.requestPermission();
    return; // can't send on first request
  }

  if (Notification.permission !== 'granted') return;

  for (const goal of goals) {
    const body = goal.scorer
      ? `${goal.scorer}\n${goal.homeName} ${goal.homeScore} – ${goal.awayScore} ${goal.awayName}`
      : `${goal.homeName} ${goal.homeScore} – ${goal.awayScore} ${goal.awayName}`;

    new Notification(`⚽ GOL! ${goal.teamName}`, {
      body,
      tag: `goal-${goal.id}`,
      renotify: true,
    });
  }
}
