import { getItemIcon, type InventoryItemName } from "../game/index.ts";
import type { Category } from "../timers/index.ts";

// Item name passed through getItemIcon for each category. Kept as a name
// (not a resolved URL) so updates to ITEM_DETAILS in the submodule
// propagate without a rebuild here. Each cooking / processing building
// uses its own building icon since each is its own top-level category.
const CATEGORY_ICON_NAME: Record<Category, InventoryItemName> = {
  Crops: "Sunflower",
  "Fruit Patches": "Apple",
  Greenhouse: "Rice",
  "Crop Machine": "Crop Machine",
  Flowers: "Red Pansy",
  Beehives: "Honey",
  Animals: "Chicken",
  "Fire Pit": "Fire Pit",
  "Smoothie Shack": "Smoothie Shack",
  Deli: "Deli",
  Kitchen: "Kitchen",
  Bakery: "Bakery",
  "Fish Market": "Fish Market",
  Composters: "Compost Bin",
  // Each Aging Shed rack uses a representative output item rather than
  // the shared building icon, so the three racks read as distinct at a
  // glance in the section header / MobileNav strip.
  "Aging Rack": "Aged Anchovy",
  "Fermentation Rack": "Pickled Broccoli",
  "Spice Rack": "Refined Salt",
  "Crafting Box": "Crafting Box",
  Resources: "Wood",
  Salt: "Salt",
  "Lava Pits": "Lava Pit",
  "Crab Traps": "Blue Crab",
};

export function getCategoryIcon(category: Category): string {
  return getItemIcon(CATEGORY_ICON_NAME[category]);
}
