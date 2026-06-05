import {
  getBoostIcon,
  getItemIcon,
  getMaxStoredSaltCharges,
  getSaltChargeGenerationTime,
  getSaltYieldPerRake,
  materializeSaltRegen,
  type BoostName,
  type GameState,
} from "../game/index.ts";
import { NODE_LABEL } from "./resources.ts";
import type { Boost, Timer, TimerContext } from "./types.ts";

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
// Yield: `getSaltYieldPerRake` gives the boost-resolved salt-per-rake
// (base 10, plus Wide Rakes, Deep Sea Salt Cave Background, Salt
// Awakening VIP). The headline shows per-rake yield regardless of
// stored charges so the boost list always has context — the subtext
// tracks how many of those rakes are actually available right now.
// Charge-regen boosts (Salty Seas, Salt Sculpture level) only affect
// interval timing and stay off the boost list.

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
  const { saltYield, boostsUsed: yieldBoostsUsed } = getSaltYieldPerRake(
    state,
    ctx.now,
  );
  const yieldBoosts = toBoosts(yieldBoostsUsed, state);

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
    const expectedYield = saltYield * storedCharges;
    const hasCharges = storedCharges > 0;

    out.push({
      id: `salt:${nodeId}`,
      category: "Salt",
      // When charges are present we lean on the standard yield headline
      // ("N Salt Charged"). At 0 the label takes over so the card reads
      // "0 Salt Charged" instead of falling back to the bare item name.
      label: hasCharges ? "Salt" : "0 Salt Charged",
      icon,
      readyAt,
      // Total salt currently claimable from this node — per-rake yield
      // × stored charges. Per-rake boosts (Wide Rakes, etc.) are listed
      // in the dropdown so the multiplier is auditable.
      predictedYield: hasCharges
        ? { amount: expectedYield, item: "Salt Charged" }
        : undefined,
      boosts: yieldBoosts,
      subtext: `${storedCharges}/${maxCharges} charges`,
      // Notifications go through the worker's ready digest, not a
      // per-node alarm: a maxed node stamps `readyAt = now`, which churns
      // the alarm fire key every sweep (re-firing every ~10 min), and six
      // nodes would otherwise fan out to six pushes. `ready` = has at
      // least one charge to rake right now; the digest groups all ready
      // nodes into one "N salt nodes ready" push and dedups until raked.
      notifyDigest: { ready: hasCharges, group: "Salt", noun: "salt node" },
      // Each node = own card; matches the beehive pattern.
      aggregationKey: `Salt|${nodeId}`,
      nodeLabel: NODE_LABEL.Salt,
      metadata: {
        nodeId,
        storedCharges: String(storedCharges),
        maxCharges: String(maxCharges),
      },
    });
  }

  return out;
}
