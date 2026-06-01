import { useMemo } from "react";

import { getChapterTicket, getItemIcon } from "../game/index.ts";
import type { NavSection } from "../components/NavMenu.tsx";
import {
  ANIMAL_BOUNTIES_SECTION_ID,
  BOUNTIES_SECTION_ID,
  CHORES_SECTION_ID,
  DELIVERIES_COINS_SECTION_ID,
  DELIVERIES_FLOWER_SECTION_ID,
  DELIVERIES_TICKETS_SECTION_ID,
} from "../components/sectionId.ts";
import { DELIVERIES_PANEL_ID } from "../app/panelRegistry.tsx";
import { CHROME_ICONS } from "../lib/assets.ts";

// Candidate sections for the Quests page's mobile section-jump menu —
// everything you owe an NPC. The list is static (no panel-visibility
// logic here): NavMenu filters by DOM existence at open time, so a panel
// that returned null (no orders, no chores) is dropped automatically.
// Adding a new panel = stamp the id + push here.
export function useQuestsNavSections(now: number): NavSection[] {
  return useMemo<NavSection[]>(() => {
    const ticket = getChapterTicket(now);
    return [
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
    ];
  }, [now]);
}
