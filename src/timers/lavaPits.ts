import {
  getBoostIcon,
  getItemIcon,
  getLavaPitTime,
  getObsidianYield,
  type BoostName,
  type GameState,
} from "../game/index.ts";
import type { Boost, Timer, TimerContext } from "./types.ts";

// One Timer per active lava pit, all stacked into a single "Obsidian"
// row inside the Resources section — same pattern as Wood / Stone /
// Iron / Gold. The aggregator sums yields and uses the earliest
// `readyAt`.
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

  const icon = getItemIcon("Obsidian");
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
    // Not started, or already collected.
    if (pit.startedAt === undefined) continue;
    if (pit.collectedAt !== undefined) continue;

    const readyAt = pit.readyAt ?? pit.startedAt + getTime();

    out.push({
      id: `resource:Obsidian:${pitId}`,
      category: "Resources",
      label: "Obsidian",
      icon,
      readyAt,
      predictedYield: { amount: yieldAmount, item: "Obsidian" },
      boosts: yieldBoosts,
      // All pits collapse into a single Obsidian card; matches the
      // Resources panel pattern used for Wood, Stone, Iron, etc.
      aggregationKey: `Resources|Obsidian`,
    });
  }

  return out;
}
