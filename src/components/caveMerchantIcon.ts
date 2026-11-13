import { NPC_WEARABLES, getAnimatedWebpUrl } from "../game/index.ts";

// Gloomwick's idle sprite — the Goblin Cave Merchant panel's header,
// Arrange-sheet and jump-nav glyph, through the same animations CDN as
// every other NPC avatar. Kept out of CaveMerchantPanel.tsx so that file
// only exports components (react-refresh).
export const CAVE_MERCHANT_ICON = getAnimatedWebpUrl(NPC_WEARABLES.gloomwick, [
  "idle-small",
]);
