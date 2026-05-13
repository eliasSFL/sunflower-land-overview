import type { Category } from "../timers/index.ts";

// Stable DOM id per category — used by the mobile nav to scroll the
// section into view. Kebab-case the category name so e.g.
// "Fruit Patches" → "section-fruit-patches".
export function sectionId(category: Category): string {
  return `section-${category.toLowerCase().replace(/\s+/g, "-")}`;
}
