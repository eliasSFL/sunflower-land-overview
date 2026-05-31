// CDN icon/texture URLs specific to the dig site. Same CDN +
// hardcoding approach as `lib/assets.ts` CHROME_ICONS — these sprites
// aren't bundled in the submodule, and the paths are long-stable.

const CDN = import.meta.env.VITE_PRIVATE_IMAGE_URL;

export const DIG_ICONS = {
  // Sand shovel — the digs-left stat glyph.
  shovel: `${CDN}/tools/sand_shovel.png`,
  // Stopwatch — daily reset countdown.
  stopwatch: `${CDN}/icons/stopwatch.png`,
  // Treasure chest — treasures-found stat.
  treasure: `${CDN}/icons/treasure_icon.png`,
  // Confused bumpkin — the legend header glyph (matches the in-game HUD).
  confused: `${CDN}/icons/expression_confused.png`,
  // Little shovel marker stamped on a guaranteed "dig here" tile.
  dig: `${CDN}/icons/dig_icon.png`,
  // The dig-site sand texture, tiled behind the grid + legend chips.
  siteBg: `${CDN}/ui/site_bg.png`,
} as const;

// Tile-status treatments the player can switch between on the board.
export const DIG_TREATMENTS = [
  { id: "flag", label: "Flag" },
  { id: "heat", label: "Heat" },
  { id: "glow", label: "Glow" },
] as const;

export type DigTreatment = (typeof DIG_TREATMENTS)[number]["id"];
