import { useMemo } from "react";

import { getCategoryIcon } from "../components/categoryIcon.ts";
import type { NavSection } from "../components/NavMenu.tsx";
import {
  IDLE_SECTION_ID,
  READY_SECTION_ID,
  sectionId,
} from "../components/sectionId.ts";
import type { FarmResponse } from "../api/fetchFarm.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { buildIdleEntries } from "../lib/idle.ts";
import type { AggregatedTimer, Category } from "../timers/index.ts";

// Build the MobileNav chip strip for the Live Timers page. With the
// two-page split (Live Timers / Farm Info), the strip only covers what
// renders on /timers — Ready, Idle, then per-category timer sections.
// Bumpkin / Deliveries / Pets etc. now live on /info and have no chip
// here.
//
// Order mirrors the on-page render order (Ready banner → Idle card →
// CATEGORY_ORDER timer panels). A new panel just needs its section id
// stamped on the panel root and a push here.
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

    if (hasReady) {
      out.push({
        id: READY_SECTION_ID,
        label: "Ready",
        icon: CHROME_ICONS.expression_alerted,
      });
    }
    const hasIdle = buildIdleEntries(data.farm, byCategory, now).length > 0;
    if (hasIdle) {
      out.push({
        id: IDLE_SECTION_ID,
        label: "Idle",
        icon: CHROME_ICONS.sleep,
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
