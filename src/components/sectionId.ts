import type { Category } from "../timers/index.ts";

// Stable DOM id per category — used by the mobile nav to scroll the
// section into view. Kebab-case the category name so e.g.
// "Fruit Patches" → "section-fruit-patches".
export function sectionId(category: Category): string {
  return `section-${category.toLowerCase().replace(/\s+/g, "-")}`;
}

// Fixed ids for the non-category panels on the left column. Used as
// scroll anchors for the matching MobileNav chips. Keeping them in
// one place makes it easy to add a new panel — declare the id here,
// stamp it on the panel root, and include it in App's nav list.
export const BUMPKIN_SECTION_ID = "section-bumpkin";
// Now page anchors: the global "ready to collect" roll-up and the
// next-4h "next up" roll-up.
export const COLLECT_SECTION_ID = "section-collect";
export const NEXT_UP_SECTION_ID = "section-next-up";
export const IDLE_SECTION_ID = "section-idle";
export const DELIVERIES_COINS_SECTION_ID = "section-deliveries-coins";
export const DELIVERIES_FLOWER_SECTION_ID = "section-deliveries-flower";
export const DELIVERIES_TICKETS_SECTION_ID = "section-deliveries-tickets";
export const CHORES_SECTION_ID = "section-chores";
export const BOUNTIES_SECTION_ID = "section-bounties";
export const ANIMAL_BOUNTIES_SECTION_ID = "section-animal-bounties";
export const LOVE_ISLAND_SHOP_SECTION_ID = "section-love-shop";
export const PETS_SECTION_ID = "section-pets";
export const PET_CRAVINGS_SECTION_ID = "section-pet-cravings";
export const VILLAGE_PROJECTS_SECTION_ID = "section-village-projects";
