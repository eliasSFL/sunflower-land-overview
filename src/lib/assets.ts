// Stable CDN URLs for chrome icons + banner backgrounds. Mirrors what the
// submodule exposes via `SUNNYSIDE.icons.*` and `SUNNYSIDE.announcement.*`,
// but hardcoded locally — these paths haven't changed in years and don't
// need to track upstream renames.

const CDN = import.meta.env.VITE_PRIVATE_IMAGE_URL;

export const CHROME_ICONS = {
  chevron_down: `${CDN}/icons/chevron_down.png`,
  chevron_up: `${CDN}/icons/chevron_up.png`,
  chevron_right: `${CDN}/icons/chevron_right.png`,
  lightning: `${CDN}/icons/lightning.png`,
} as const;

export const BANNER_URLS = {
  marketplace: `${CDN}/announcements/marketplace_dark.png`,
  marketplaceLight: `${CDN}/announcements/marketplace.png`,
  flowerBanner: `${CDN}/announcements/flower_banner.png`,
  summer: `${CDN}/announcements/summer_banner.webp`,
} as const;
