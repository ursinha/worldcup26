import { useState, useEffect, useRef, useCallback } from 'react';
import { usePolling } from './usePolling';

const TOAST_DURATION = 8_000;
const TITLE_FLASH_INTERVAL = 2_000;
const TITLE_FLASH_MAX = 30_000;

let goalIdCounter = 0;

/**
 * Detect new goals by diffing match scores between polls.
 * Returns { goals, dismiss } where goals is an array of active notifications.
 */
export function useGoalDetector() {
  const { data } = usePolling('/api/matches', 15_000);
  const prevScoresRef = useRef(null); // { matchId: { home, away, homeName, awayName } }
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

  // Diff scores on each poll
  useEffect(() => {
    if (!data?.games) return;

    const currentScores = {};
    for (const game of data.games) {
      currentScores[game.id] = {
        home: +game.home_score || 0,
        away: +game.away_score || 0,
        homeName: game.home_team_name_en,
        awayName: game.away_team_name_en,
        homeScorers: game.home_scorers ?? '',
        awayScorers: game.away_scorers ?? '',
      };
    }

    const prev = prevScoresRef.current;
    if (prev) {
      const newGoals = [];

      for (const [matchId, cur] of Object.entries(currentScores)) {
        const old = prev[matchId];
        if (!old) continue;

        if (cur.home > old.home) {
          const scorer = extractNewScorer(old.homeScorers, cur.homeScorers);
          newGoals.push({
            id: ++goalIdCounter,
            matchId,
            teamName: cur.homeName,
            scorer,
            homeScore: cur.home,
            awayScore: cur.away,
            homeName: cur.homeName,
            awayName: cur.awayName,
          });
        }

        if (cur.away > old.away) {
          const scorer = extractNewScorer(old.awayScorers, cur.awayScorers);
          newGoals.push({
            id: ++goalIdCounter,
            matchId,
            teamName: cur.awayName,
            scorer,
            homeScore: cur.home,
            awayScore: cur.away,
            homeName: cur.homeName,
            awayName: cur.awayName,
          });
        }
      }

      if (newGoals.length > 0) {
        setGoals((prev) => [...prev, ...newGoals]);
        fireNotifications(newGoals);
      }
    }

    prevScoresRef.current = currentScores;
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
 * Try to extract the new scorer name by diffing scorer strings.
 * Scorer format is like "Player 45', Player2 67'"
 */
function extractNewScorer(oldScorers, newScorers) {
  if (!newScorers) return null;
  const oldParts = new Set((oldScorers ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const newParts = newScorers.split(',').map((s) => s.trim()).filter(Boolean);
  const added = newParts.filter((p) => !oldParts.has(p));
  return added.length > 0 ? added[added.length - 1] : newParts[newParts.length - 1] ?? null;
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
