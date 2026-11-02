// Inactive-boost bridge — boost collectibles and wearables the player owns
// but that aren't currently in effect, with upstream's own buff labels.
//
// Everything here is a loop over upstream's buff tables that asks upstream
// per item about its state (CLAUDE.md batch pattern) — no boost rules are
// re-derived locally:
//   - `COLLECTIBLE_BUFF_LABELS` / `BUMPKIN_ITEM_BUFF_LABELS` decide which
//     items are boosts at all and what they say (an empty label list means
//     "no boost for this farm", the same test as upstream's `hasBoost`).
//   - Expired: a temporary booster (totem, hourglass, shrine) that is still
//     placed but no longer `isTemporaryCollectibleActive`. Its expiry is
//     the latest `getCollectibleExpiry` across placed copies, which folds
//     in the SPEED_BOOSTS durations and any `extendedMs`.
//   - In chest: a placeable boost collectible (`isPlaceableCollectible`)
//     with spare copies in the chest (`getChestItemCount` — inventory minus
//     every placed copy) and none in effect (`isCollectibleBuilt`, or
//     `isTemporaryCollectibleActive` for boosters). Boosters with a placed
//     copy are listed under Expired instead, so nothing shows twice.
//   - Unworn: a boost wearable with unequipped copies (`availableWardrobe`)
//     that neither the Bumpkin nor any farm hand wears (`isWearableActive`).
//
// Buff text goes through upstream's `translate`, which the app build
// aliases to an English-only dictionary shim (src/game/stubs/translate-en.ts).

import type { BuffLabel } from "features/game/types";
import { BUMPKIN_ITEM_BUFF_LABELS } from "features/game/types/bumpkinItemBuffs";
import { COLLECTIBLE_BUFF_LABELS } from "features/game/types/collectibleItemBuffs";
import {
  getCollectibleExpiry,
  getCollectiblesAcrossLocations,
  isCollectibleBuilt,
  isTemporaryCollectible,
  isTemporaryCollectibleActive,
} from "features/game/lib/collectibleBuilt";
import { isWearableActive } from "features/game/lib/wearables";
import { availableWardrobe } from "features/game/events/landExpansion/equip";
import {
  getChestItemCount,
  isPlaceableCollectible,
} from "features/island/hud/components/inventory/utils/inventory";
import { getKeys } from "lib/object";

import type { BumpkinItem, GameState, InventoryItemName } from "./types.ts";

export type { BuffLabel };

export type InactiveBoost<Name extends string> = {
  name: Name;
  labels: BuffLabel[];
  // Wall-clock expiry of an expired booster (latest across placed copies).
  expiredAt?: number;
  // Spare copies sitting in the chest / wardrobe.
  count?: number;
};

// Most recently expired first — the one you most likely meant to renew.
export function getExpiredBoosters(
  game: GameState,
  now: number,
): InactiveBoost<InventoryItemName>[] {
  const out: InactiveBoost<InventoryItemName>[] = [];
  for (const name of getKeys(COLLECTIBLE_BUFF_LABELS)) {
    if (!isTemporaryCollectible(name)) continue;
    const placed = getCollectiblesAcrossLocations(game, name);
    if (placed.length === 0) continue;
    if (isTemporaryCollectibleActive({ name, game, now })) continue;
    const labels = COLLECTIBLE_BUFF_LABELS[name]?.(game) ?? [];
    if (labels.length === 0) continue;
    const expiredAt = Math.max(
      ...placed.map((collectible) =>
        getCollectibleExpiry({ name, collectible, game }),
      ),
    );
    out.push({ name, labels, expiredAt });
  }
  return out.sort((a, b) => (b.expiredAt ?? 0) - (a.expiredAt ?? 0));
}

// Upstream table order (grouped by what they boost).
export function getChestBoostCollectibles(
  game: GameState,
  now: number,
): InactiveBoost<InventoryItemName>[] {
  const out: InactiveBoost<InventoryItemName>[] = [];
  for (const name of getKeys(COLLECTIBLE_BUFF_LABELS)) {
    if (!isPlaceableCollectible(name)) continue;
    const count = getChestItemCount(game, name).toNumber();
    if (count <= 0) continue;

    if (isTemporaryCollectible(name)) {
      if (isTemporaryCollectibleActive({ name, game, now })) continue;
      if (getCollectiblesAcrossLocations(game, name).length > 0) continue;
    } else if (isCollectibleBuilt({ name, game })) {
      continue;
    }

    const labels = COLLECTIBLE_BUFF_LABELS[name]?.(game) ?? [];
    if (labels.length === 0) continue;
    out.push({ name, labels, count });
  }
  return out;
}

export function getUnwornBoostWearables(
  game: GameState,
): InactiveBoost<BumpkinItem>[] {
  const wardrobe = availableWardrobe(game);
  const out: InactiveBoost<BumpkinItem>[] = [];
  for (const name of getKeys(BUMPKIN_ITEM_BUFF_LABELS)) {
    const count = wardrobe[name] ?? 0;
    if (count <= 0) continue;
    if (isWearableActive({ name, game })) continue;
    const labels = BUMPKIN_ITEM_BUFF_LABELS[name] ?? [];
    if (labels.length === 0) continue;
    out.push({ name, labels, count });
  }
  return out;
}
