import { CATEGORY_ORDER, type Category } from "../timers/index.ts";
import { getItemIcon } from "../game/index.ts";
import { sectionId } from "./sectionId.ts";
import { pixelDarkBorderStyle } from "./ui/borderStyles.ts";
import { InnerPanel } from "./ui/index.ts";

// Floating bottom strip that jumps to a section on tap. Lives on
// small viewports only — at `lg+` the layout already sits in a
// scannable multi-column grid, so the strip would just be noise.
//
// Each chip renders an item icon as a recognisable representative for
// the category (no separate icon set to maintain — we lean on
// ITEM_DETAILS via getItemIcon).

const CATEGORY_ICON: Record<Category, string> = {
  Crops: "Sunflower",
  "Fruit Patches": "Apple",
  Greenhouse: "Rice",
  "Crop Machine": "Crop Machine",
  Flowers: "Red Pansy",
  Beehives: "Honey",
  Animals: "Chicken",
  Cooking: "Fire Pit",
  Composters: "Compost Bin",
  "Aging Shed": "Aging Shed",
  "Crafting Box": "Crafting Box",
  Resources: "Wood",
  Salt: "Salt",
};

type Props = {
  // Pass through which categories should be linkable. We keep it
  // declarative so the caller (App) doesn't need to know about hidden
  // sections — if a section isn't rendered, it isn't in this list.
  visibleCategories: readonly Category[];
};

export function MobileNav({ visibleCategories }: Props) {
  if (visibleCategories.length === 0) return null;

  const handleJump = (category: Category) => {
    const el = document.getElementById(sectionId(category));
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Render in CATEGORY_ORDER so the strip mirrors the on-page order.
  const ordered = CATEGORY_ORDER.filter((c) => visibleCategories.includes(c));

  return (
    <nav
      aria-label="Section navigation"
      // Fixed to the bottom on mobile; hidden once the Farm ID sidebar
      // appears (lg+) since the grid layout is already scannable.
      className="fixed inset-x-0 bottom-0 z-20 px-1 pb-2 lg:hidden"
      // pb adds room for the iOS home indicator on devices that report
      // a safe-area inset.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <InnerPanel className="p-1!">
        <ul className="flex gap-1 overflow-x-auto">
          {ordered.map((category) => (
            <li key={category} className="shrink-0">
              <button
                type="button"
                onClick={() => handleJump(category)}
                className="flex items-center gap-1 whitespace-nowrap text-xs"
                style={{
                  ...pixelDarkBorderStyle,
                  background: "#c28569",
                  padding: "2px 6px",
                }}
              >
                <img
                  src={getItemIcon(CATEGORY_ICON[category])}
                  alt=""
                  aria-hidden
                  className="h-4 w-4 shrink-0 object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
                <span>{category}</span>
              </button>
            </li>
          ))}
        </ul>
      </InnerPanel>
    </nav>
  );
}
