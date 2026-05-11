import {
  getItemIcon,
  getMaxStoredSaltCharges,
  getSaltChargeGenerationTime,
  materializeSaltRegen,
  type GameState,
} from "../game/index.ts";
import type { Timer, TimerContext } from "./types.ts";

// One Timer per salt node. We DO NOT read `salt.storedCharges` /
// `salt.nextChargeAt` straight off the game state — the server stores
// the last-touched values, so without applying elapsed time they're
// stale. `materializeSaltRegen` walks the regen timeline from the
// stored anchor to `now`, capping at the per-node max (which moves up
// with Salt Sculpture levels) and rolling `nextChargeAt` forward.
//
// Cap-aware behavior, mirrored from salt.ts:
//   - charges < max → readyAt = nextChargeAt (countdown is when the
//     next charge accrues).
//   - charges == max → readyAt = now (no more charges accrue; the
//     player should rake one off so accrual restarts).
//
// We intentionally don't surface charge-regen boosts (Salty Seas skill,
// Salt Sculpture level) on these cards for now. The regen interval is
// still pulled from `getSaltChargeGenerationTime` so the countdown is
// correct; only the per-card boost list is suppressed.

export function extractSaltTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const saltFarm = state.saltFarm;
  if (!saltFarm || !saltFarm.nodes) return [];

  const nodeIds = Object.keys(saltFarm.nodes);
  if (nodeIds.length === 0) return [];

  const { chargeGenerationTimeMs } = getSaltChargeGenerationTime({
    gameState: state,
  });
  const maxCharges = getMaxStoredSaltCharges(
    state.sculptures?.["Salt Sculpture"]?.level ?? 0,
  );

  const icon = getItemIcon("Salt");
  const out: Timer[] = [];

  for (const nodeId of nodeIds) {
    const node = saltFarm.nodes[nodeId];
    const materialized = materializeSaltRegen(node.salt, ctx.now, {
      chargeIntervalMs: chargeGenerationTimeMs,
      maxCharges,
    });

    const { storedCharges, nextChargeAt } = materialized;
    const atMax = storedCharges >= maxCharges;
    const readyAt = atMax ? ctx.now : nextChargeAt;

    out.push({
      id: `salt:${nodeId}`,
      category: "Salt",
      label: "Salt",
      icon,
      readyAt,
      // No predictedYield — each charge is worth 10+ salt when raked
      // (not 1), so "2 Salt" would misrepresent the count. The headline
      // falls back to `label` ("Salt") and the stored charges go in
      // `subtext` as small text under the headline.
      subtext: `${storedCharges}/${maxCharges} charges`,
      // Each node = own card; matches the beehive pattern.
      aggregationKey: `Salt|${nodeId}`,
      metadata: {
        nodeId,
        storedCharges: String(storedCharges),
        maxCharges: String(maxCharges),
      },
    });
  }

  return out;
}
