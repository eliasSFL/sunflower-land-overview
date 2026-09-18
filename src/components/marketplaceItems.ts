import {
  getBudImage,
  getItemIcon,
  ITEM_NAMES,
  KNOWN_ITEMS,
  type CollectionName,
} from "../game/index.ts";

// Naming the things the marketplace trades.
//
// Upstream keys every item in a report `{collection}-{itemId}` (see
// `getItemKey` in the BE's marketplaceActivity), and the same pair is
// what the per-item `tradeable` endpoint takes. So this module owns
// both directions: parsing a report key into something renderable, and
// handing the parts back to a drill-down request.
//
// Turning an id into a name means inverting the id maps the game
// itself uses — `KNOWN_ITEMS` for collectibles, `ITEM_NAMES` for
// wearables. Buds and pets are NFTs with no name table, so they're
// labelled by id. Player-economy keys (`economies-…`) carry a slug
// rather than a game item and resolve to null; callers drop them.

export type MarketItem = {
  /** The raw `{collection}-{id}` key, as upstream reports it. */
  key: string;
  collection: CollectionName;
  id: number;
  name: string;
  /** Empty string when we have no artwork (pets). */
  icon: string;
  /** Whether `tradeable` can be asked about this item. */
  drillable: boolean;
};

export function marketItemKey(collection: string, id: number): string {
  return `${collection}-${id}`;
}

export function resolveMarketItem(key: string): MarketItem | null {
  // `lastIndexOf` rather than `indexOf`: an `economies-{slug}-{id}` key
  // has dashes inside the slug, and the id is always the final segment.
  const dash = key.lastIndexOf("-");
  if (dash === -1) return null;
  const collection = key.slice(0, dash);
  const id = Number(key.slice(dash + 1));
  if (!Number.isFinite(id)) return null;

  switch (collection) {
    case "collectibles": {
      const name = KNOWN_ITEMS[id];
      if (!name) return null;
      return {
        key,
        collection,
        id,
        name,
        icon: getItemIcon(name),
        drillable: true,
      };
    }
    case "wearables": {
      const name = ITEM_NAMES[id];
      if (!name) return null;
      return {
        key,
        collection,
        id,
        name,
        icon: getItemIcon(name),
        drillable: true,
      };
    }
    case "buds":
      return {
        key,
        collection,
        id,
        name: `Bud #${id}`,
        icon: getBudImage(id),
        drillable: true,
      };
    case "pets":
      return {
        key,
        collection,
        id,
        name: `Pet #${id}`,
        icon: "",
        drillable: true,
      };
    default:
      // `economies-{slug}-{id}` and anything upstream adds later. We
      // can't name it, so we don't show it.
      return null;
  }
}

/**
 * Resolve the item a trade record points at. Trades carry `collection`
 * and `itemId` as separate fields rather than a composed key, so this
 * is the same lookup approached from the other side.
 */
export function resolveTradeItem(
  collection: CollectionName,
  itemId: number,
): MarketItem | null {
  return resolveMarketItem(marketItemKey(collection, itemId));
}

/**
 * Icon for an item named rather than id'd.
 *
 * A player's OPEN listings and offers key their `items` map by name
 * (`MarketplaceTradeableName`), not by the numeric id the activity
 * report uses — so this is the by-name door into the same artwork.
 * Bud NFTs are named `Bud #123` and have their own image host; anything
 * `getItemIcon` doesn't know returns "" and renders without an icon.
 */
export function marketItemIcon(name: string): string {
  const bud = /^Bud #(\d+)$/.exec(name);
  if (bud) return getBudImage(Number(bud[1]));
  // Names outside the inventory/wardrobe unions (pet NFTs, economy
  // tokens) fall through `getItemIcon` to "" rather than throwing.
  return getItemIcon(name as Parameters<typeof getItemIcon>[0]);
}
