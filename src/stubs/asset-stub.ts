// Stub for asset imports inside the merged sunflower-land tree.
// The game's lookup tables (CROPS, FLOWERS, ANIMALS, etc.) reference image
// URLs like `import sunflower from "assets/crops/sunflower.png"` — bundling
// those would pull every sprite/audio file into the overview's bundle for
// no visual benefit (we render with our own icon set in src/lib/icons.ts).
//
// Named exports use a Proxy so ANY property access returns an empty string,
// covering the game's SUNNYSIDE / ITEM_DETAILS / BUMPKIN_ITEM_PARTS / etc.
// import shapes without us having to enumerate them.
const proxy: Record<string, string> = new Proxy(
  {},
  {
    get: () => "",
  },
);

export default "";
export const SUNNYSIDE = proxy;
export const ITEM_DETAILS = proxy;
export const BUMPKIN_ITEM_PARTS = proxy;
export const BUMPKIN_ITEM_BUFF_LABELS = proxy;
export const ITEM_ICONS = proxy;
export const SOUNDS = proxy;
