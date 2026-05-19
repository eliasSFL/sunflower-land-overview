import type { Category } from "../timers/index.ts";
import { getCategoryIcon } from "./categoryIcon.ts";

// Per-category atmospheric copy for the empty-state vignette. Headline
// sets the mood (a 2–4 word phrase the player would read first);
// subtitle is the factual "nothing here" line. Subtitles intentionally
// stay close to plain English so a brand-new player still understands
// what the section is for.
const COPY: Record<Category, { headline: string; subtitle: string }> = {
  Crops: {
    headline: "The fields are bare",
    subtitle: "No crops planted on this farm.",
  },
  "Fruit Patches": {
    headline: "The orchard sleeps",
    subtitle: "No fruit planted on this farm.",
  },
  Greenhouse: {
    headline: "Glass walls, empty pots",
    subtitle: "No greenhouse crops planted.",
  },
  "Crop Machine": {
    headline: "The machine hums softly",
    subtitle: "Crop machine idle.",
  },
  Flowers: {
    headline: "Quiet flower beds",
    subtitle: "No flowers planted.",
  },
  Beehives: {
    headline: "Silent hives",
    subtitle: "No active beehives.",
  },
  Resources: {
    headline: "Untouched land",
    subtitle: "No resources placed.",
  },
  Salt: {
    headline: "Still salt pans",
    subtitle: "No salt nodes placed.",
  },
  "Crab Traps": {
    headline: "The shore is quiet",
    subtitle: "No traps placed on this farm.",
  },
  Animals: {
    headline: "Empty pens",
    subtitle: "No animals on this farm.",
  },
  "Fire Pit": {
    headline: "Cold ashes",
    subtitle: "Nothing on the fire.",
  },
  Bakery: {
    headline: "Cold ovens",
    subtitle: "Nothing baking.",
  },
  Deli: {
    headline: "Quiet counter",
    subtitle: "Nothing in the deli.",
  },
  "Smoothie Shack": {
    headline: "Blender at rest",
    subtitle: "Nothing blending.",
  },
  Kitchen: {
    headline: "Quiet kitchen",
    subtitle: "Nothing cooking.",
  },
  "Fish Market": {
    headline: "Slow at the market",
    subtitle: "Nothing processing.",
  },
  Composters: {
    headline: "The pile sits still",
    subtitle: "No composters placed.",
  },
  "Aging Rack": {
    headline: "Empty barrels",
    subtitle: "No fish aging.",
  },
  "Fermentation Rack": {
    headline: "Still jars",
    subtitle: "Nothing fermenting.",
  },
  "Spice Rack": {
    headline: "Quiet shelves",
    subtitle: "Nothing spicing.",
  },
  "Crafting Box": {
    headline: "Tools at rest",
    subtitle: "Nothing crafting.",
  },
};

// Drop-in replacement for the prior single-line empty caption. Renders
// a small "scene strip" (a darker band that echoes the OuterPanel tone,
// with the category's pixel icon centered) above a two-line caption:
// thematic headline first, factual subtitle second.
//
// Generalises across every category from a single config — no per-
// category asset work. Individual panels can later swap this for a
// richer per-category diorama without touching the call sites.
export function EmptyVignette({ category }: { category: Category }) {
  const { headline, subtitle } = COPY[category];
  return (
    <div className="flex flex-col items-center gap-2 py-1">
      <div
        className="flex w-full items-center justify-center"
        style={{
          // Same warm tan as OuterPanel — sits a half-step darker than
          // the InnerPanel's `#e4a672`, so the strip reads as a recessed
          // background rather than another foreground card.
          background: "#c28569",
          height: "64px",
        }}
      >
        <img
          src={getCategoryIcon(category)}
          alt=""
          aria-hidden
          className="object-contain"
          style={{ width: "42px", height: "42px" }}
        />
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <p className="text-sm">{headline}</p>
        <p className="text-xs opacity-60">{subtitle}</p>
      </div>
    </div>
  );
}
