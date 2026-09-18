import { describe, expect, it, vi } from "vitest";

// Mock the boundary module so the id → name tables are fixed here. We
// test the KEY PARSING — which is ours — not upstream's id maps.
vi.mock("../game/index.ts", () => ({
  KNOWN_ITEMS: { 101: "Sunflower" } as Record<number, string>,
  ITEM_NAMES: { 202: "Red Farmer Shirt" } as Record<number, string>,
  getItemIcon: vi.fn((name: string) => `icon:${name}`),
  getBudImage: vi.fn((id: number) => `bud:${id}`),
}));

import {
  marketItemIcon,
  marketItemKey,
  resolveMarketItem,
  resolveTradeItem,
} from "./marketplaceItems.ts";

describe("resolveMarketItem", () => {
  it("names a collectible from its id", () => {
    expect(resolveMarketItem("collectibles-101")).toEqual({
      key: "collectibles-101",
      collection: "collectibles",
      id: 101,
      name: "Sunflower",
      icon: "icon:Sunflower",
      drillable: true,
    });
  });

  it("names a wearable from the wardrobe table, not the item table", () => {
    // Same numeric space, different map — reading the wrong one would
    // silently mislabel every wearable row.
    expect(resolveMarketItem("wearables-202")).toMatchObject({
      name: "Red Farmer Shirt",
      collection: "wearables",
    });
  });

  it("labels NFTs by id, since they have no name table", () => {
    expect(resolveMarketItem("buds-7")).toMatchObject({
      name: "Bud #7",
      icon: "bud:7",
    });
    expect(resolveMarketItem("pets-3")).toMatchObject({
      name: "Pet #3",
      // No artwork source for pets — an empty icon renders without one.
      icon: "",
    });
  });

  it("drops a player-economy key", () => {
    // `economies-{slug}-{id}` carries a minigame token, not a game
    // item; there is nothing to name, so the caller omits the row.
    expect(resolveMarketItem("economies-some-slug-5")).toBeNull();
  });

  it("splits on the LAST dash so a dashed slug can't shift the id", () => {
    // This is why `lastIndexOf` is used: `indexOf` would parse the id
    // as "some-slug-5" and yield NaN, and a future dashed collection
    // would break the same way.
    expect(resolveMarketItem("economies-a-b-c-12")).toBeNull();
  });

  it("returns null for an unknown id rather than an unnamed row", () => {
    expect(resolveMarketItem("collectibles-999")).toBeNull();
    expect(resolveMarketItem("wearables-999")).toBeNull();
  });

  it("returns null for a malformed key", () => {
    expect(resolveMarketItem("collectibles")).toBeNull();
    expect(resolveMarketItem("collectibles-abc")).toBeNull();
  });
});

describe("resolveTradeItem", () => {
  it("reaches the same item from separate collection + id fields", () => {
    // Trades carry the two parts separately; reports carry them joined.
    // Both doors must land on the same row.
    expect(resolveTradeItem("collectibles", 101)).toEqual(
      resolveMarketItem("collectibles-101"),
    );
  });
});

describe("marketItemKey", () => {
  it("composes the key upstream uses", () => {
    expect(marketItemKey("collectibles", 101)).toBe("collectibles-101");
  });
});

describe("marketItemIcon", () => {
  it("routes a Bud NFT name to the bud image host", () => {
    // Open trades name items rather than id them, so `Bud #12` arrives
    // as a string and must still find its artwork.
    expect(marketItemIcon("Bud #12")).toBe("bud:12");
  });

  it("falls back to the item icon table for everything else", () => {
    expect(marketItemIcon("Sunflower")).toBe("icon:Sunflower");
  });
});
