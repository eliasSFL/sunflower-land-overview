import type { GameState, MonumentName } from "../game/index.ts";

// A village project that has just reached its cheer goal and warrants a
// one-off completion push. Distinct from the timer pipeline: village
// projects have no `readyAt` — they complete when *other* players cheer,
// at an unpredictable time — so they're detected by diffing snapshots on
// the cron sweep rather than scheduled against an alarm.
export type CompletedProjectNotification = {
  name: MonumentName;
  title: string;
  body: string;
};

// Newly-completed projects: names in `completedProjects` that weren't in
// `seen` (the set the DO last recorded for this farm).
//
// `completedProjects` is server-populated and mutually exclusive with the
// active `villageProjects` entry — the backend moves a project there once
// its `cheers` hit `REQUIRED_CHEERS`, removing the active entry. So
// membership alone is the "it's done" signal; we don't recompute the
// cheer threshold (and couldn't cleanly — upstream's `isMonumentComplete`
// isn't exported).
//
// Restarting a project (startProject) drops it back out of
// `completedProjects`; the caller stores the *current* set as `seen` each
// pass, so a later re-completion naturally re-fires.
export function detectCompletedProjects(
  game: GameState,
  seen: readonly string[],
): CompletedProjectNotification[] {
  const completed = game.socialFarming?.completedProjects ?? [];
  const seenSet = new Set(seen);
  const out: CompletedProjectNotification[] = [];
  for (const name of completed) {
    if (seenSet.has(name)) continue;
    out.push({
      name,
      title: "Village project complete!",
      body: `${name} reached its cheer goal 🎉`,
    });
  }
  return out;
}
