import { useMemo } from "react";

import { getCategoryIcon } from "../components/categoryIcon.ts";
import { getActiveDeliveryGroups } from "../components/deliveryGroups.ts";
import type { NavSection } from "../components/MobileNav.tsx";
import {
  BUMPKIN_SECTION_ID,
  DELIVERIES_COINS_SECTION_ID,
  DELIVERIES_FLOWER_SECTION_ID,
  DELIVERIES_TICKETS_SECTION_ID,
  IDLE_SECTION_ID,
  LOVE_ISLAND_SHOP_SECTION_ID,
  NEXT_UP_SECTION_ID,
  PET_CRAVINGS_SECTION_ID,
  PETS_SECTION_ID,
  READY_SECTION_ID,
  sectionId,
} from "../components/sectionId.ts";
import type { FarmResponse } from "../api/fetchFarm.ts";
import {
  getActiveFloatingIsland,
  getChapterTicket,
  getItemIcon,
} from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { buildIdleEntries } from "../lib/idle.ts";
import type { AggregatedTimer, Category } from "../timers/index.ts";

// Build the MobileNav strip declaratively. Order mirrors the on-page
// render order (left column top→bottom, then timer sections). A new
// panel just needs its section id stamped on the panel root and a push
// here.
export function useNavSections({
  data,
  timers,
  byCategory,
  visibleCategories,
  now,
}: {
  data: FarmResponse | undefined;
  timers: AggregatedTimer[];
  byCategory: Map<string, AggregatedTimer[]>;
  visibleCategories: Category[];
  now: number;
}): NavSection[] {
  return useMemo<NavSection[]>(() => {
    if (!data) return [];
    const out: NavSection[] = [];
    const hasReady = timers.some((t) => {
      if (t.idle) return false;
      if (t.slots && t.slots.length > 0)
        return t.slots.some((s) => s.readyAt <= now);
      return t.readyAt <= now;
    });

    out.push({
      id: BUMPKIN_SECTION_ID,
      label: "Bumpkin",
      icon: CHROME_ICONS.level_up,
    });
    if (hasReady) {
      out.push({
        id: READY_SECTION_ID,
        label: "Ready",
        icon: CHROME_ICONS.expression_alerted,
      });
    }
    out.push({
      id: NEXT_UP_SECTION_ID,
      label: "Next up",
      icon: CHROME_ICONS.timer,
    });
    const hasIdle = buildIdleEntries(data.farm, byCategory, now).length > 0;
    if (hasIdle) {
      out.push({
        id: IDLE_SECTION_ID,
        label: "Idle",
        icon: CHROME_ICONS.sleep,
      });
    }
    const groups = getActiveDeliveryGroups(data.farm, now);
    if (groups.coins.length > 0) {
      out.push({
        id: DELIVERIES_COINS_SECTION_ID,
        label: "Coin Deliveries",
        icon: CHROME_ICONS.coins,
      });
    }
    if (groups.sfl.length > 0) {
      out.push({
        id: DELIVERIES_FLOWER_SECTION_ID,
        label: "FLOWER Deliveries",
        icon: CHROME_ICONS.flower_token,
      });
    }
    if (groups.tickets.length > 0) {
      const ticketName = getChapterTicket(now);
      out.push({
        id: DELIVERIES_TICKETS_SECTION_ID,
        label: `${ticketName} Deliveries`,
        icon: getItemIcon(ticketName),
      });
    }
    // The Love Island shop panel only renders while an event window is
    // live (LoveIslandShopPanel returns null otherwise) — mirror that
    // gate so the nav chip doesn't dangle off-season.
    if (getActiveFloatingIsland({ state: data.farm })) {
      out.push({
        id: LOVE_ISLAND_SHOP_SECTION_ID,
        label: "Love Shop",
        icon: getItemIcon("Love Charm"),
      });
    }
    // Mirror the PetsPanel render gate so the chip doesn't dangle for a
    // farm with no pets.
    const pets = data.farm.pets;
    const hasPets =
      Object.keys(pets?.common ?? {}).length > 0 ||
      Object.keys(pets?.nfts ?? {}).length > 0;
    if (hasPets) {
      out.push({
        id: PET_CRAVINGS_SECTION_ID,
        label: "Pet Cravings",
        icon: getItemIcon("Pet House"),
      });
      out.push({
        id: PETS_SECTION_ID,
        label: "Pets",
        icon: getItemIcon("Pet House"),
      });
    }
    for (const cat of visibleCategories) {
      out.push({
        id: sectionId(cat),
        label: cat,
        icon: getCategoryIcon(cat),
      });
    }
    return out;
  }, [data, now, timers, visibleCategories, byCategory]);
}
