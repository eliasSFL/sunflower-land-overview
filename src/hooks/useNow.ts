import { useEffect, useState } from "react";

// Ticking clock driving every live countdown. `enabled` lets a caller
// freeze it: each tick re-runs the whole timer extraction + re-renders the
// dashboard, so while a full-screen overlay hides the countdowns (e.g. the
// Arrange panels modal) we pause to keep that per-second main-thread work
// from janking interactions like drag. On re-enable we snap `now` to the
// present so the countdowns catch up immediately.
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    // Async catch-up (not a synchronous effect-body setState) so `now`
    // snaps to the present the moment the clock re-enables, instead of
    // waiting up to a full interval for the first tick.
    const catchUp = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(catchUp);
      clearInterval(id);
    };
  }, [intervalMs, enabled]);
  return now;
}
