import { useMemo } from "react";

import { getChapterTicket, getItemIcon } from "../game/index.ts";
import type { NavSection } from "../components/NavMenu.tsx";
import {
  ANIMAL_BOUNTIES_SECTION_ID,
  BOUNTIES_SECTION_ID,
  BUMPKIN_SECTION_ID,
  CHORES_SECTION_ID,
  DELIVERIES_COINS_SECTION_ID,
  DELIVERIES_FLOWER_SECTION_ID,
  DELIVERIES_TICKETS_SECTION_ID,
  LOVE_ISLAND_SHOP_SECTION_ID,
  PET_CRAVINGS_SECTION_ID,
  PETS_SECTION_ID,
  VILLAGE_PROJECTS_SECTION_ID,
} from "../components/sectionId.ts";
import { DELIVERIES_PANEL_ID } from "../app/panelRegistry.tsx";
import { CHROME_ICONS } from "../lib/assets.ts";

// Candidate sections for the Farm Info page's mobile section-jump
// menu. The list is static (no panel-visibility logic here) — NavMenu
// filters by DOM existence at open time, so a panel that returned null
// (off-season, empty list, no placed pets) is dropped from the menu
// automatically. Adding a new panel = stamp the id + push here.
export function useFarmInfoNavSections(now: number): NavSection[] {
  return useMemo<NavSection[]>(() => {
    const ticket = getChapterTicket(now);
    return [
      {
        id: BUMPKIN_SECTION_ID,
        label: "Bumpkin",
        icon: CHROME_ICONS.player,
      },
      {
        id: VILLAGE_PROJECTS_SECTION_ID,
        label: "Village Projects",
        icon: CHROME_ICONS.cheer,
      },
      {
        id: DELIVERIES_COINS_SECTION_ID,
        label: "Coin Deliveries",
        icon: CHROME_ICONS.coins,
        panelId: DELIVERIES_PANEL_ID,
      },
      {
        id: DELIVERIES_FLOWER_SECTION_ID,
        label: "FLOWER Deliveries",
        icon: CHROME_ICONS.flower_token,
        panelId: DELIVERIES_PANEL_ID,
      },
      {
        id: DELIVERIES_TICKETS_SECTION_ID,
        label: `${ticket} Deliveries`,
        icon: getItemIcon(ticket),
        panelId: DELIVERIES_PANEL_ID,
      },
      {
        id: CHORES_SECTION_ID,
        label: "Chores",
        icon: CHROME_ICONS.scroll,
      },
      {
        id: BOUNTIES_SECTION_ID,
        label: "Bounties",
        icon: CHROME_ICONS.chest,
      },
      {
        id: ANIMAL_BOUNTIES_SECTION_ID,
        label: "Animal Bounties",
        icon: getItemIcon("Cow"),
      },
      {
        id: LOVE_ISLAND_SHOP_SECTION_ID,
        label: "Love Island Shop",
        icon: CHROME_ICONS.love_charm,
      },
      {
        id: PET_CRAVINGS_SECTION_ID,
        label: "Pet Cravings",
        icon: getItemIcon("Pet House"),
      },
      {
        id: PETS_SECTION_ID,
        label: "Pets",
        icon: getItemIcon("Pet House"),
      },
    ];
  }, [now]);
}
