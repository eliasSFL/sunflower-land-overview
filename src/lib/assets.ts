// Stable CDN URLs for chrome icons + banner backgrounds. Mirrors what the
// submodule exposes via `SUNNYSIDE.icons.*` and `SUNNYSIDE.announcement.*`,
// but hardcoded locally — these paths haven't changed in years and don't
// need to track upstream renames.

const CDN = import.meta.env.VITE_PRIVATE_IMAGE_URL;

// Vite-resolved assets from anywhere under the submodule's
// `src/assets/`. Needed when the asset isn't published to the CDN (the
// FLOWER token icon, in-game UI sprites, etc). Eagerly globbing the
// full tree lets callers reference any image by its path-from-assets-
// root, e.g. `submoduleAsset("icons/coins.webp")` or
// `submoduleAsset("food/pumpkin_soup.webp")`. Each match gets emitted
// as its own static asset; the URL string is what we return.
const SUBMODULE_ASSETS = import.meta.glob<string>(
  "../../sunflower-land/src/assets/**/*.{webp,png,gif,svg}",
  { eager: true, query: "?url", import: "default" },
);
const ASSETS_PREFIX = "../../sunflower-land/src/assets/";
const SUBMODULE_ASSET_MAP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [path, url] of Object.entries(SUBMODULE_ASSETS)) {
    const idx = path.indexOf(ASSETS_PREFIX);
    if (idx === -1) continue;
    m.set(path.slice(idx + ASSETS_PREFIX.length), url);
  }
  return m;
})();
export function submoduleAsset(pathFromAssetsRoot: string): string {
  return SUBMODULE_ASSET_MAP.get(pathFromAssetsRoot) ?? "";
}

export const CHROME_ICONS = {
  chevron_down: `${CDN}/icons/chevron_down.png`,
  chevron_up: `${CDN}/icons/chevron_up.png`,
  chevron_right: `${CDN}/icons/chevron_right.png`,
  confirm: `${CDN}/icons/confirm.png`,
  expression_alerted: `${CDN}/icons/expression_alerted.png`,
  lightning: `${CDN}/icons/lightning.png`,
  player: `${CDN}/icons/player.png`,
  // In-game XP / progress bar chrome — used by the BumpkinSummaryPanel
  // to mirror the HUD's level bar style. `level_up.png` isn't on the
  // CDN; we bundle it from the submodule. `progress_bar_border.png`
  // IS on the CDN.
  level_up: submoduleAsset("icons/level_up.png"),
  progress_bar_border: `${CDN}/ui/progress/progress_bar_border.png`,
  // Next-Up panel chip on the mobile nav.
  timer: submoduleAsset("icons/timer.gif"),
  // Floating settings button + modal close. `settings_disc` is the
  // gray disc-with-gear used by the main game's HUD; bundled because
  // it isn't on the CDN. `empty_disc` is the same disc with no glyph,
  // used as the background for the refresh button (overlay an inline
  // SVG refresh arrow on top).
  settings_disc: submoduleAsset("icons/settings_disc.png"),
  // `empty_disc` is just the disc outline (transparent inside).
  // `empty_disc_background` is the matching fill — layer the fill
  // first then the outline on top to mirror how settings_disc looks.
  empty_disc: submoduleAsset("icons/empty_disc.png"),
  empty_disc_background: submoduleAsset("icons/empty_disc_background.png"),
  fast_forward: submoduleAsset("icons/fast_forward.png"),
  close: `${CDN}/icons/close.png`,
  // Currency icons live alongside the submodule's other inventory
  // sprites — not on the CDN — so we bundle them at build time.
  coins: submoduleAsset("icons/coins.webp"),
  flower_token: submoduleAsset("icons/flower_token.webp"),
  gem: submoduleAsset("icons/gem.webp"),
  love_charm: submoduleAsset("icons/love_charm.webp"),
} as const;

export const BANNER_URLS = {
  marketplace: `${CDN}/announcements/marketplace_dark.png`,
  marketplaceLight: `${CDN}/announcements/marketplace.png`,
  flowerBanner: `${CDN}/announcements/flower_banner.png`,
  summer: `${CDN}/announcements/summer_banner.webp`,
} as const;
