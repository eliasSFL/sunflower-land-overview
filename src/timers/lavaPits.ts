import {
  getBoostIcon,
  getItemIcon,
  getLavaPitTime,
  getObsidianYield,
  type BoostName,
  type GameState,
} from "../game/index.ts";
import type { Boost, Timer, TimerContext } from "./types.ts";

// One Timer per active lava pit, all stacked into a single Obsidian
// card inside the "Lava Pits" section (same yield data the Resources
// panel previously showed). Placed-but-not-running pits emit an idle
// Timer each, sharing one aggregationKey so they collapse into a
// single "N× Lava Pit" idle row at the bottom of the section.
//
// Active = `startedAt` set AND `collectedAt` undefined (post-collection
// upstream clears `startedAt` and stamps `collectedAt`).
//
// `readyAt` is persisted by upstream `startLavaPit` as
// `startedAt + getLavaPitTime(game).time`. Boost re-application after
// start does NOT retroactively change it, so we always trust the
// stored value. Fallback computes it from the current game state for
// the rare case where `startedAt` is set but `readyAt` is missing
// (older save shapes).
//
// Active-pit check mirrors upstream — `x === undefined && y === undefined`
// means landscaped away.

function toBoosts(
  raw: ReadonlyArray<{ name: BoostName; value: string }>,
  state: GameState,
): Boost[] | undefined {
  if (raw.length === 0) return undefined;
  return raw.map(({ name, value }) => ({
    name,
    value,
    icon: getBoostIcon(name, state),
  }));
}

export function extractLavaPitTimers(
  state: GameState,
  _ctx: TimerContext,
): Timer[] {
  const lavaPits = state.lavaPits;
  if (!lavaPits || Object.keys(lavaPits).length === 0) return [];

  const obsidianIcon = getItemIcon("Obsidian");
  const pitIcon = getItemIcon("Lava Pit");
  const { amount: yieldAmount, boostsUsed: yieldBoostsUsed } = getObsidianYield(
    { game: state },
  );
  const yieldBoosts = toBoosts(yieldBoostsUsed, state);

  // Computed lazily — only needed if a pit is missing `readyAt`.
  let cachedTime: number | undefined;
  const getTime = (): number => {
    if (cachedTime === undefined) {
      cachedTime = getLavaPitTime({ game: state }).time;
    }
    return cachedTime;
  };

  const out: Timer[] = [];

  for (const [pitId, pit] of Object.entries(lavaPits)) {
    // Landscaped away.
    if (pit.x === undefined && pit.y === undefined) continue;

    // Idle: placed but not currently running (never started, or
    // already collected — upstream clears `startedAt` on collect).
    if (pit.startedAt === undefined) {
      out.push({
        id: `lavaPit:${pitId}:idle`,
        category: "Lava Pits",
        label: "Lava Pit",
        icon: pitIcon,
        readyAt: 0,
        idle: true,
        idleText: "Not running",
        // Shared key so multiple idle pits collapse into one row with
        // `count: N` — matches the active-side pattern below.
        aggregationKey: `LavaPits|idle`,
      });
      continue;
    }

    const readyAt = pit.readyAt ?? pit.startedAt + getTime();

    out.push({
      id: `lavaPit:${pitId}`,
      category: "Lava Pits",
      label: "Obsidian",
      icon: obsidianIcon,
      readyAt,
      predictedYield: { amount: yieldAmount, item: "Obsidian" },
      boosts: yieldBoosts,
      // All running pits collapse into a single Obsidian card.
      aggregationKey: `LavaPits|Obsidian`,
      nodeLabel: "Lava Pit",
    });
  }

  return out;
}
