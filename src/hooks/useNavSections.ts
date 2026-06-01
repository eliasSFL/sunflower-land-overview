import { useMemo } from "react";

import { getCategoryIcon } from "../components/categoryIcon.ts";
import type { NavSection } from "../components/NavMenu.tsx";
import { sectionId } from "../components/sectionId.ts";
import type { Category } from "../timers/index.ts";

// Build the mobile section-jump strip for the Producing page — one chip
// per visible timer category, in render order. The ready-now roll-up,
// next-4h timeline, and idle nudge live on the bespoke Now page (which
// has no jump-nav), so they no longer appear here.
//
// NavMenu filters by DOM existence at open time, so a category whose
// panel collapsed to the empty vignette still gets a chip (the section
// root renders either way) — harmless, it just scrolls to the header.
export function useNavSections({
  visibleCategories,
}: {
  visibleCategories: Category[];
}): NavSection[] {
  return useMemo<NavSection[]>(
    () =>
      visibleCategories.map((cat) => ({
        id: sectionId(cat),
        label: cat,
        icon: getCategoryIcon(cat),
      })),
    [visibleCategories],
  );
}
