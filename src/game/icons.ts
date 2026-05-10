// Icon URLs for items the overview shows. Vite resolves every
// `assets/*.png|webp|jpg|svg|gif` import inside the submodule to the real
// file (the asset-stub now only catches audio + font extensions), so
// `ITEM_DETAILS[name].image` works directly for every item — crops,
// fruits, resources, decorations, NFTs.

import { ITEM_DETAILS } from "features/game/types/images";
import { SUNNYSIDE as UPSTREAM_SUNNYSIDE } from "assets/sunnyside";

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
