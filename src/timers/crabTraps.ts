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
// PRNG counter threading: when multiple spots will yield the same
// crustacean (e.g. two empty Crab Pots both catching Isopod), the server
// advances `farmActivity["Isopod Caught"]` by 1 per collection — so the
// Pistol Shrimp roll on the 2nd Isopod sees counter N+1, not N. We
// mirror that by sorting same-crustacean groups by readyAt ascending
// (player most likely collects earliest-ready first) and threading the
// counter through `getCrustaceanAmount` for each spot. Without this,
// every same-species spot would either all roll the bonus or none.
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

  // Resolve each spot's crustacean up front, then group by it so the
  // PRNG counter can advance per-collection within each species group.
  type Entry = {
    trapId: string;
    waterTrap: NonNullable<(typeof trapSpots)[string]["waterTrap"]>;
    crustaceanName: CrustaceanName;
    baseAmount: number;
  };
  const byCrustacean = new Map<CrustaceanName, Entry[]>();

  for (const [trapId, spot] of Object.entries(trapSpots)) {
    const waterTrap = spot.waterTrap;
    if (!waterTrap) continue;

    // `caught` is set by placeWaterTrap when the chum is consumed — it's
    // always a single { CrustaceanName: number } pair. Defensive empty
    // check matches collectWaterTrap.ts, which falls back to
    // `caughtCrustacean(...)` if missing; for prediction we just skip.
    const names: CrustaceanName[] = getKeys(waterTrap.caught);
    const crustaceanName = names[0];
    if (!crustaceanName) continue;

    const baseAmount = waterTrap.caught[crustaceanName] ?? 1;
    const list = byCrustacean.get(crustaceanName) ?? [];
    list.push({ trapId, waterTrap, crustaceanName, baseAmount });
    byCrustacean.set(crustaceanName, list);
  }

  const out: Timer[] = [];

  for (const [crustaceanName, group] of byCrustacean) {
    // Collect order assumption: earliest-ready first. Matches what a
    // player most often does, and what `batchCropYields` / other
    // batch predictors use to thread their counters.
    group.sort((a, b) => a.waterTrap.readyAt - b.waterTrap.readyAt);
    const icon = getItemIcon(crustaceanName);
    let counter = farmActivity[`${crustaceanName} Caught`] ?? 0;

    for (const { trapId, waterTrap, baseAmount } of group) {
      const { boostedAmount, boostsUsed } = getCrustaceanAmount(
        state,
        baseAmount,
        crustaceanName,
        { farmId: ctx.farmId, counter },
      );
      counter += 1;

      // `getCrustaceanAmount` returns boost *names* only — unlike the
      // other yield helpers it doesn't surface per-boost values. We leave
      // `value` blank rather than mirror collectWaterTrap.ts's hardcoded
      // "+2" / "+1" labels (replicating upstream string logic would
      // silently rot if a new boost is added). The TimerCard tooltip
      // still renders each boost's icon + label so the player sees what
      // fired.
      const boosts: Boost[] | undefined = boostsUsed.length
        ? boostsUsed.map((name) => ({ name, value: "" }))
        : undefined;

      out.push({
        id: `crab-trap:${trapId}`,
        category: "Crab Traps",
        label: crustaceanName,
        icon,
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
  }

  return out;
}
