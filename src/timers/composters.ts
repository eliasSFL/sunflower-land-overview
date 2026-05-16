import {
  composterDetails,
  getBoostIcon,
  getCompostAmount,
  getItemIcon,
  getObjectEntries,
  rollWormAmount,
  type BoostName,
  type ComposterName,
  type FarmActivityName,
  type GameState,
} from "../game/index.ts";
import type { Boost, Timer, TimerContext } from "./types.ts";

// Each active composter contributes TWO cards under the Composters
// section — one for the compost output, one for the worm reward —
// mirroring how Animals shows Egg + Feather (or Milk + Leather) as
// separate stacked cards. Both share the composter's `readyAt`.
//
// Compost amount lives in `producing.items` already boost-resolved at
// start time (see startComposter.ts). Worm reward is rolled
// deterministically at collect via `rollWormAmount`, seeded by farmId
// + farmActivity[`<Worm> Collected`]; the predicted amount matches
// what the server will hand out on claim.
//
// Idle composters (placed but not started) emit a single idle card so
// the section makes it clear which composters are sitting unused.

const COMPOSTERS: readonly ComposterName[] = [
  "Compost Bin",
  "Turbo Composter",
  "Premium Composter",
];

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

export function extractComposterTimers(
  state: GameState,
  ctx: TimerContext,
): Timer[] {
  const out: Timer[] = [];
  const farmActivity = state.farmActivity ?? {};

  for (const name of COMPOSTERS) {
    const instances = state.buildings?.[name] ?? [];
    instances.forEach((inst, idx) => {
      // Skip unplaced instances (e.g. mid-move). Matches the cooking
      // extractor's idle-skip rule.
      if (!inst.coordinates) return;
      const instanceKey = inst.id ?? `${idx}`;

      const producing = inst.producing;
      if (producing) {
        const entries = getObjectEntries(producing.items ?? {});
        const [item, amount] = entries[0] ?? [name, 0];

        // --- Compost row ---
        // Yield amount is already boost-resolved into `producing.items`
        // at start time. Re-run `getCompostAmount` against the current
        // game state to recover the per-boost breakdown for the tooltip;
        // the amount we surface stays the one persisted on the producer
        // (so a boost added or removed mid-batch doesn't lie about what
        // the player will actually collect).
        let compostBoosts: Boost[] | undefined;
        try {
          const { boostsUsed } = getCompostAmount({
            game: state,
            building: name,
          });
          compostBoosts = toBoosts(boostsUsed, state);
        } catch {
          // Fall back to no boost list if upstream throws.
        }
        out.push({
          id: `composter:${name}:${instanceKey}:compost`,
          category: "Composters",
          label: item,
          icon: getItemIcon(item),
          readyAt: producing.readyAt,
          predictedYield: { amount: amount ?? 0, item },
          boosts: compostBoosts,
          subtext: name,
          aggregationKey: `Composters|${name}|${instanceKey}|${item}`,
        });

        // --- Worm row ---
        // Each composter type maps to a distinct worm
        // (Earthworm / Grub / Red Wiggler), so the seed counter is
        // just the farm-activity value at the moment we look.
        const worm = composterDetails[name].worm;
        const wormActivityKey =
          `${worm} Collected` satisfies FarmActivityName;
        const counter = farmActivity[wormActivityKey] ?? 0;
        let wormAmount = 0;
        let wormBoosts: Boost[] | undefined;
        try {
          const rolled = rollWormAmount({
            state,
            building: name,
            farmId: ctx.farmId,
            counter,
          });
          wormAmount = rolled.worms;
          wormBoosts = toBoosts(rolled.boostsUsed, state);
        } catch {
          // Fall back to no worm prediction if upstream throws.
        }
        if (wormAmount > 0) {
          out.push({
            id: `composter:${name}:${instanceKey}:worm`,
            category: "Composters",
            label: worm,
            icon: getItemIcon(worm),
            readyAt: producing.readyAt,
            predictedYield: { amount: wormAmount, item: worm },
            subtext: name,
            boosts: wormBoosts,
            aggregationKey: `Composters|${name}|${instanceKey}|${worm}`,
          });
        }
        return;
      }

      // Idle composter — placed but not started. Match the cooking
      // idle-card layout.
      out.push({
        id: `composter:${name}:${instanceKey}`,
        category: "Composters",
        label: name,
        icon: getItemIcon(name),
        readyAt: 0,
        idle: true,
        idleText: "Not composting",
        aggregationKey: `Composters|${name}|${instanceKey}`,
      });
    });
  }

  return out;
}
