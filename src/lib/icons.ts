import { ITEM_DETAILS } from "features/game/types/images";
import type { TimerCategory } from "./timers";

// Most timer labels (`Sunflower`, `Apple Pie`, `Pink Dolphin`, ...) are
// InventoryItemName / AchievementName keys, so ITEM_DETAILS[label]?.image
// resolves them directly. Vite's `assetCdn` plugin (see vite.config.ts)
// rewrites the underlying `import x from "assets/..."` calls to CDN URL
// strings, and SUNNYSIDE-derived images are CDN templates already, so each
// `image` field is a plain `string` URL by the time we read it.
//
// The few labels that aren't valid item keys are mapped here. They fall
// into two buckets:
//   1. Synthetic labels emitted by the timer extractor when no recipe /
//      product is available yet — `"Fermentation"`, `"Aging"`, `"Spice"`
//      (aging shed slots), `"Crafting"` (no active recipe), `"Daily
//      Chest"` (login reward).
//   2. Numbered or grouped labels — `"Salt Node 1"`, `"Salt Node 2"` —
//      that share one underlying icon.
const LABEL_ALIASES: Record<string, string> = {
  "Daily Chest": "Treasure Key",
  Crafting: "Crafting Box",
  Fermentation: "Fermentation Barrel",
  Aging: "Aging Rack",
  Spice: "Spice Rack",
  "Lava Pit": "Lava Pit",
  Tree: "Tree",
};

function imageFor(label: string): string | null {
  const direct = ITEM_DETAILS[label as keyof typeof ITEM_DETAILS]?.image;
  if (direct) return direct;
  const alias = LABEL_ALIASES[label];
  if (alias) {
    const aliased = ITEM_DETAILS[alias as keyof typeof ITEM_DETAILS]?.image;
    if (aliased) return aliased;
  }
  // "Salt Node 1" / "Salt Node 2" / ... — every node shares the Salt icon.
  if (label.startsWith("Salt Node")) {
    return ITEM_DETAILS.Salt?.image ?? null;
  }
  return null;
}

/**
 * Resolve an icon URL for a timer's (category, label). null = no icon.
 *
 * The `category` argument is currently unused — labels are unique enough
 * to disambiguate across categories — but kept in the signature so
 * callers don't need to change if a future label collision (same string,
 * two different items) forces us to disambiguate by category.
 *
 * Labels of the form `"Output: Input"` (e.g. `"Greenhouse Goodie:
 * Pickled Radish"`) fall back to the output's icon when the full label
 * isn't directly mapped — the in-game icon for these compound recipes is
 * the umbrella product (`Greenhouse Goodie`), not the variant.
 */
export function getIconUrl(
  _category: TimerCategory,
  label: string,
): string | null {
  const direct = imageFor(label);
  if (direct) return direct;

  const colonIdx = label.indexOf(": ");
  if (colonIdx > 0) {
    return imageFor(label.slice(0, colonIdx));
  }
  return null;
}
