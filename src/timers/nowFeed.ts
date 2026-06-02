import type { AggregatedTimer, Category } from "./types.ts";

// A single collectable / upcoming line, flattened from the aggregated
// timers. Multi-slot cards (cooking buildings) contribute one entry per
// slot — the player cares about each recipe, not the building.
export type FeedItem = {
  key: string;
  icon?: string;
  label: string;
  amount: number;
  readyAt: number;
  // The category the item belongs to, used to group the Collect view.
  category: Category;
};

// Flatten every timer (and every slot of a multi-slot timer) into one
// FeedItem list, skipping idle placeholders. Shared by the Collect-now
// roll-up and the next-4h timeline so both read the same source.
function flatten(timers: AggregatedTimer[]): FeedItem[] {
  const out: FeedItem[] = [];
  for (const t of timers) {
    if (t.idle) continue;
    if (t.slots && t.slots.length > 0) {
      t.slots.forEach((slot, i) => {
        out.push({
          key: `${t.id}:slot:${i}`,
          icon: slot.icon,
          label: slot.item,
          amount: slot.amount,
          readyAt: slot.readyAt,
          category: t.category,
        });
      });
      continue;
    }
    out.push({
      key: t.id,
      icon: t.icon,
      label: t.predictedYield?.item ?? t.label,
      amount: t.predictedYield?.amount ?? 0,
      readyAt: t.readyAt,
      category: t.category,
    });
  }
  return out;
}

export type CollectGroup = {
  category: Category;
  items: FeedItem[];
};

// Everything ready *right now*, grouped by category in CATEGORY_ORDER
// (the input `timers` are already in that order, so first-seen wins).
// `total` is the flat count across all groups — the hero headline.
export function collectReady(
  timers: AggregatedTimer[],
  now: number,
): { groups: CollectGroup[]; total: number } {
  const groups: CollectGroup[] = [];
  const byCategory = new Map<string, CollectGroup>();
  let total = 0;
  for (const item of flatten(timers)) {
    if (item.readyAt > now) continue;
    let group = byCategory.get(item.category);
    if (!group) {
      group = { category: item.category, items: [] };
      byCategory.set(item.category, group);
      groups.push(group);
    }
    group.items.push(item);
    total += 1;
  }
  return { groups, total };
}

// Items coming ready within `windowMs` of now (exclusive of already-ready),
// sorted soonest-first.
export function upcomingWithin(
  timers: AggregatedTimer[],
  now: number,
  windowMs: number,
): FeedItem[] {
  return flatten(timers)
    .filter((i) => i.readyAt > now && i.readyAt - now <= windowMs)
    .sort((a, b) => a.readyAt - b.readyAt);
}

// Same upcoming-within-window items as `upcomingWithin`, but grouped by
// category for the Next-up roll-up (the Collect-now layout applied to
// "what's about to land"). Items stay soonest-first within each group,
// and groups appear in order of their soonest item (first-seen wins,
// and the input is already sorted). `total` is the flat count.
export function upcomingGrouped(
  timers: AggregatedTimer[],
  now: number,
  windowMs: number,
): { groups: CollectGroup[]; total: number } {
  const items = upcomingWithin(timers, now, windowMs);
  const groups: CollectGroup[] = [];
  const byCategory = new Map<string, CollectGroup>();
  for (const item of items) {
    let group = byCategory.get(item.category);
    if (!group) {
      group = { category: item.category, items: [] };
      byCategory.set(item.category, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return { groups, total: items.length };
}
