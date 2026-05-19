import {
  getCrustaceanAmount,
  getItemIcon,
  getKeys,
  type CrustaceanName,
  type GameState,
} from "../game/index.ts";
import type { Boost, Timer, TimerContext } from "./types.ts";

// One Timer per active trap spot under "Crab Traps". Predicts the
// crustacean catch (already-decided species + base count come from
// `waterTrap.caught`, which placeWaterTrap stamps via `caughtCrustacean`).
// `getCrustaceanAmount` applies the on-collect boosts:
//   * Crab House (collectible): flat +2
//   * Pistol Shrimp (wearable):  20% PRNG +1, seeded by
//       farmActivity[`${crustaceanName} Caught`]
//
// Empty trap spots are skipped (matches the flower pattern — empty beds
// don't emit a row). The IdlePanel surfaces "N trap spots empty" via
// `lib/idle.ts` so the player still sees their unused capacity.

export function extractCrabTrapTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const trapSpots = state.crabTraps?.trapSpots;
  if (!trapSpots || Object.keys(trapSpots).length === 0) return [];

  const farmActivity = state.farmActivity ?? {};
  const out: Timer[] = [];

  for (const [trapId, spot] of Object.entries(trapSpots)) {
    const waterTrap = spot.waterTrap;
    if (!waterTrap) continue;

    // `caught` is set by placeWaterTrap when the chum is consumed — it's
    // always a single { CrustaceanName: number } pair. Defensive empty
    // check matches collectWaterTrap.ts, which falls back to
    // `caughtCrustacean(...)` if missing; for prediction we just skip.
    const names = getKeys(waterTrap.caught) as CrustaceanName[];
    const crustaceanName = names[0];
    if (!crustaceanName) continue;

    const baseAmount = waterTrap.caught[crustaceanName] ?? 1;
    const counter = farmActivity[`${crustaceanName} Caught`] ?? 0;
    const { boostedAmount, boostsUsed } = getCrustaceanAmount(
      state,
      baseAmount,
      crustaceanName,
      { farmId: ctx.farmId, counter },
    );

    // `getCrustaceanAmount` returns boost *names* only — unlike the
    // other yield helpers it doesn't surface per-boost values. We leave
    // `value` blank rather than mirror collectWaterTrap.ts's hardcoded
    // "+2" / "+1" labels (replicating upstream string logic would silently
    // rot if a new boost is added). The TimerCard tooltip still renders
    // each boost's icon + label so the player sees what fired.
    const boosts: Boost[] | undefined = boostsUsed.length
      ? boostsUsed.map((name) => ({ name, value: "" }))
      : undefined;

    out.push({
      id: `crab-trap:${trapId}`,
      category: "Crab Traps",
      label: crustaceanName,
      icon: getItemIcon(crustaceanName),
      readyAt: waterTrap.readyAt,
      predictedYield: {
        amount: boostedAmount.toNumber(),
        item: crustaceanName,
      },
      subtext: waterTrap.type,
      boosts,
      nodeLabel: waterTrap.type,
      aggregationKey: `Crab Traps|${trapId}`,
    });
  }

  return out;
}
