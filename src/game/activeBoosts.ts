// Active-boost bridge — which boost collectibles and wearables are currently
// in effect on a farm, with upstream's own buff labels for each.
//
// Everything here is a loop over upstream's buff tables that asks upstream
// per item whether it's active (CLAUDE.md batch pattern) — no boost rules
// are re-derived locally:
//   - `COLLECTIBLE_BUFF_LABELS` / `BUMPKIN_ITEM_BUFF_LABELS` decide which
//     items are boosts at all and what they say (an empty label list means
//     "no boost for this farm", the same test as upstream's `hasBoost`).
//   - Temporary boosters (totems, hourglasses, shrines) are active while
//     `isTemporaryCollectibleActive` holds; their countdown is the latest
//     `getCollectibleExpiry` across placed copies, which already folds in
//     the SPEED_BOOSTS durations and any `extendedMs`.
//   - Every other collectible is active when `isCollectibleBuilt` (placed,
//     constructed, not used up).
//   - Wearables are active when `isWearableActive` (worn by the Bumpkin or
//     any farm hand).
//
// Buff text goes through upstream's `translate`, which the app build
// aliases to an English-only dictionary shim (src/game/stubs/translate-en.ts).

import type { BuffLabel } from "features/game/types";
import { BUMPKIN_ITEM_BUFF_LABELS } from "features/game/types/bumpkinItemBuffs";
import { COLLECTIBLE_BUFF_LABELS } from "features/game/types/collectibleItemBuffs";
import type { CollectibleName } from "features/game/types/craftables";
import {
  getCollectibleExpiry,
  getCollectiblesAcrossLocations,
  isCollectibleBuilt,
  isTemporaryCollectible,
  isTemporaryCollectibleActive,
} from "features/game/lib/collectibleBuilt";
import { isWearableActive } from "features/game/lib/wearables";
import { getKeys } from "lib/object";

import type { BumpkinItem, GameState, InventoryItemName } from "./types.ts";

export type { BuffLabel };

export type ActiveBoost<Name extends string> = {
  name: Name;
  labels: BuffLabel[];
  // Wall-clock expiry for temporary boosters; absent for permanent ones.
  expiresAt?: number;
};

// Temporary boosters first (soonest to expire on top), then permanent
// collectibles in upstream's table order (grouped by what they boost).
export function getActiveCollectibleBoosts(
  game: GameState,
  now: number,
): ActiveBoost<InventoryItemName>[] {
  const temporary: ActiveBoost<InventoryItemName>[] = [];
  const permanent: ActiveBoost<InventoryItemName>[] = [];

  for (const name of getKeys(COLLECTIBLE_BUFF_LABELS)) {
    if (isTemporaryCollectible(name)) {
      if (!isTemporaryCollectibleActive({ name, game, now })) continue;
      const labels = COLLECTIBLE_BUFF_LABELS[name]?.(game) ?? [];
      if (labels.length === 0) continue;
      const expiresAt = Math.max(
        ...getCollectiblesAcrossLocations(game, name).map((collectible) =>
          getCollectibleExpiry({ name, collectible, game }),
        ),
      );
      temporary.push({ name, labels, expiresAt });
      continue;
    }

    // The table is keyed by InventoryItemName; `isCollectibleBuilt` only
    // reads the placement maps by name, so a non-placeable key is simply
    // never built. Narrowing cast only.
    if (!isCollectibleBuilt({ name: name as CollectibleName, game })) continue;
    const labels = COLLECTIBLE_BUFF_LABELS[name]?.(game) ?? [];
    if (labels.length === 0) continue;
    permanent.push({ name, labels });
  }

  temporary.sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0));
  return [...temporary, ...permanent];
}

export function getActiveWearableBoosts(
  game: GameState,
): ActiveBoost<BumpkinItem>[] {
  const out: ActiveBoost<BumpkinItem>[] = [];
  for (const name of getKeys(BUMPKIN_ITEM_BUFF_LABELS)) {
    if (!isWearableActive({ name, game })) continue;
    const labels = BUMPKIN_ITEM_BUFF_LABELS[name] ?? [];
    if (labels.length === 0) continue;
    out.push({ name, labels });
  }
  return out;
}
