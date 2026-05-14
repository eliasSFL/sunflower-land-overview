import { getItemIcon } from "../game/index.ts";
import type { Category } from "../timers/index.ts";

// Item name passed through getItemIcon for each category. Kept as a name
// (not a resolved URL) so updates to ITEM_DETAILS in the submodule
// propagate without a rebuild here. Each cooking / processing building
// uses its own building icon since each is its own top-level category.
const CATEGORY_ICON_NAME: Record<Category, string> = {
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
  "Aging Shed": "Aging Shed",
  "Crafting Box": "Crafting Box",
  Resources: "Wood",
  Salt: "Salt",
};

export function getCategoryIcon(category: Category): string {
  return getItemIcon(CATEGORY_ICON_NAME[category]);
}
