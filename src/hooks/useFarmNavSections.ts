import { useMemo } from "react";

import { getItemIcon } from "../game/index.ts";
import type { NavSection } from "../components/NavMenu.tsx";
import {
  BUMPKIN_SECTION_ID,
  LOVE_ISLAND_SHOP_SECTION_ID,
  PET_CRAVINGS_SECTION_ID,
  PETS_SECTION_ID,
  VILLAGE_PROJECTS_SECTION_ID,
} from "../components/sectionId.ts";
import { CHROME_ICONS } from "../lib/assets.ts";

// Candidate sections for the Farm page's mobile section-jump menu — your
// identity and standing. Static list; NavMenu filters by DOM existence
// at open time, so an off-season / empty panel is dropped automatically.
export function useFarmNavSections(): NavSection[] {
  return useMemo<NavSection[]>(
    () => [
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
    ],
    [],
  );
}
