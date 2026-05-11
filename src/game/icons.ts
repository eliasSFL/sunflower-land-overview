// Icon URLs for items the overview shows. Vite resolves every
// `assets/*.png|webp|jpg|svg|gif` import inside the submodule to the real
// file (the asset-stub now only catches audio + font extensions), so
// `ITEM_DETAILS[name].image` works directly for every item — crops,
// fruits, resources, decorations, NFTs.

import { ITEM_DETAILS } from "features/game/types/images";
import { SUNNYSIDE as UPSTREAM_SUNNYSIDE } from "assets/sunnyside";
import { KNOWN_IDS } from "features/game/types";
import { ITEM_IDS } from "features/game/types/bumpkin";
import { BUMPKIN_REVAMP_SKILL_TREE } from "features/game/types/bumpkinSkills";
import { CALENDAR_EVENT_ICONS } from "features/game/types/calendar";
import { getBudImage } from "lib/buds/types";

// Upstream `getWearableImage` uses
//   new URL(`/src/assets/wearables/<id>.webp`, import.meta.url).href
// which only works inside the submodule's own Vite dev server — the
// leading `/` makes it absolute to the app origin, so in our build it
// would point to `<our-domain>/src/assets/wearables/<id>.webp` (404).
// Use Vite's `import.meta.glob` to build a real id → URL map at build
// time. `query: "?url", import: "default"` keeps file contents out of
// the bundle; each webp becomes its own emitted static asset.
const WEARABLE_URLS = import.meta.glob<string>(
  "../../sunflower-land/src/assets/wearables/*.webp",
  { eager: true, query: "?url", import: "default" },
);

const WEARABLE_BY_ID: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (const [path, url] of Object.entries(WEARABLE_URLS)) {
    const match = path.match(/\/(\d+)\.webp$/);
    if (match) out[Number(match[1])] = url;
  }
  return out;
})();

export function getItemIcon(name: string): string {
  const detail = (ITEM_DETAILS as Record<string, { image?: string }>)[name];
  return detail?.image ?? "";
}

// CDN announcement / banner backgrounds. We expose a narrow accessor so
// callers don't accidentally import `SUNNYSIDE` directly from the
// submodule and bypass the boundary.
export function getBannerUrl(
  key: "marketplace" | "marketplaceLight" | "flowerBanner" | "summer",
): string {
  const banners = (UPSTREAM_SUNNYSIDE as { announcement?: Record<string, string> })
    .announcement;
  return banners?.[key] ?? "";
}

// Boost name → icon URL. Mirrors what BoostsDisplay.tsx shows in-game,
// but reimplemented locally so we don't pull in the BoostsDisplay React
// component and its transitive .tsx dependencies (RequirementsLabel,
// AnimatedPanel, marketplace tradeables module, etc.).
//
// Lookup order matches upstream:
//   1. Calendar event → fixed icon map
//   2. Bumpkin skill → SKILL_TREE entry's `image`
//   3. Wearable → /src/assets/wearables/<id>.webp (Vite resolves)
//   4. Collectible → ITEM_DETAILS[name].image
//   5. Bud → CDN URL by parsing the "Bud #N" name
//   6. Fallback → SUNNYSIDE.icons.lightning (or empty if missing)
//
// Wearables run before collectibles because some boost sources (e.g.
// "Green Amulet") live in both KNOWN_IDS and ITEM_IDS, and the boost is
// granted by wearing the item — so the wearable image is the right one.

const KNOWN_IDS_MAP = KNOWN_IDS as Record<string, number | undefined>;
const ITEM_IDS_MAP = ITEM_IDS as Record<string, number | undefined>;
const SKILL_TREE = BUMPKIN_REVAMP_SKILL_TREE as Record<
  string,
  { image?: string } | undefined
>;
const CALENDAR_ICONS = CALENDAR_EVENT_ICONS as Record<
  string,
  string | undefined
>;

const LIGHTNING_FALLBACK = (() => {
  const icons = (UPSTREAM_SUNNYSIDE as { icons?: Record<string, string> }).icons;
  return icons?.lightning ?? "";
})();

export function getBoostIcon(name: string, _state: unknown): string {
  if (!name) return LIGHTNING_FALLBACK;

  // 1. Calendar event icon — covers things like "bountifulHarvest".
  const calendarIcon = CALENDAR_ICONS[name];
  if (calendarIcon) return calendarIcon;

  // 2. Bumpkin skill — uses the skill node's image. (Upstream picks
  // boostedItemIcon ?? image in BoostsDisplay; for our purposes the
  // skill image itself reads well in a compact list.)
  const skill = SKILL_TREE[name];
  if (skill?.image) return skill.image;

  // 3. Wearable image lookup — runs before collectibles by design.
  const wearableId = ITEM_IDS_MAP[name];
  if (wearableId !== undefined) {
    const url = WEARABLE_BY_ID[wearableId];
    if (url) return url;
    // Otherwise fall through to other strategies.
  }

  // 4. Collectible image from ITEM_DETAILS.
  if (KNOWN_IDS_MAP[name] !== undefined) {
    const detail = (ITEM_DETAILS as Record<string, { image?: string }>)[name];
    if (detail?.image) return detail.image;
  }

  // 5. Bud NFT — "Bud #1234".
  if (name.startsWith("Bud #")) {
    const budId = Number(name.split("#")[1]);
    if (!Number.isNaN(budId)) return getBudImage(budId);
  }

  return LIGHTNING_FALLBACK;
}

// Boost name → human label. The upstream `getBoostLabel` startCases
// names that don't have punctuation and translates calendar events.
// We don't ship i18n, so the literal name is fine: every boost name in
// BoostName is already a human-readable phrase ("Beetroot Amulet",
// "Acre Farm", etc.). The only ones that would benefit from translation
// are calendar event keys ("bountifulHarvest"); we lightly title-case
// those so they read sanely without pulling in startCase.
export function getBoostLabel(name: string): string {
  if (CALENDAR_ICONS[name] !== undefined) {
    // Calendar keys are camelCase — split on uppercase boundaries.
    return name
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }
  return name;
}
