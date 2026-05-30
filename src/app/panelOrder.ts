import type { PanelDescriptor } from "./panelRegistry.tsx";

// Persisted per-page arrangement. `order` is the player's explicit panel
// sequence (arrangeable ids only); `hidden` is the set they've collapsed
// away. Both reference panel ids from the registry. An id absent from the
// current live set (e.g. an off-season category) is retained in `order`
// so its position is restored when the panel returns.
export type Arrangement = { order: string[]; hidden: string[] };

export const EMPTY_ARRANGEMENT: Arrangement = { order: [], hidden: [] };

// Shape guard for persisted arrangements — both fields must be string
// arrays, since `order`/`hidden` are spread and Set-constructed downstream.
// Used to reject corrupt/legacy localStorage payloads on load.
export function isArrangement(v: unknown): v is Arrangement {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    Array.isArray(a.order) &&
    a.order.every((x) => typeof x === "string") &&
    Array.isArray(a.hidden) &&
    a.hidden.every((x) => typeof x === "string")
  );
}

// Merge the saved explicit order with the currently-live id set. Saved
// order wins; any live id missing from it is spliced in right after its
// default predecessor, so a newly-shipped panel (or a category that just
// became visible) lands in its natural spot instead of being dumped at
// the bottom. Ids in `savedOrder` that aren't live are preserved in place.
export function mergeOrder(savedOrder: string[], liveIds: string[]): string[] {
  const result = [...savedOrder];
  for (let i = 0; i < liveIds.length; i++) {
    const id = liveIds[i];
    if (result.includes(id)) continue;
    const prev = i > 0 ? liveIds[i - 1] : undefined;
    // After its default predecessor; a new leading panel (no predecessor)
    // goes to the front, not the bottom.
    const at =
      prev !== undefined && result.includes(prev)
        ? result.indexOf(prev) + 1
        : i === 0
          ? 0
          : result.length;
    result.splice(at, 0, id);
  }
  return result;
}

export type ResolvedArrangement = {
  // Pinned panels first (in builder order), then visible arrangeable
  // panels in resolved order. This is what the page renders.
  renderPanels: PanelDescriptor[];
  // Every live arrangeable panel in resolved order, tagged with its
  // hidden state — drives the Arrange sheet (sortable list + hidden tray).
  items: { id: string; label: string; icon: string; hidden: boolean }[];
  // Live arrangeable ids in resolved order (visible AND hidden). Used to
  // splice a drag result back into a complete order and to rank nav chips.
  orderedLiveIds: string[];
};

export function resolveArrangement(
  saved: Arrangement,
  livePanels: PanelDescriptor[],
): ResolvedArrangement {
  const pinned = livePanels.filter((p) => p.pinned);
  const arrangeable = livePanels.filter((p) => !p.pinned);
  const byId = new Map(arrangeable.map((p) => [p.id, p] as const));
  const hidden = new Set(saved.hidden);

  const orderedLiveIds = mergeOrder(
    saved.order,
    arrangeable.map((p) => p.id),
  ).filter((id) => byId.has(id));

  const visible = orderedLiveIds
    .filter((id) => !hidden.has(id))
    .map((id) => byId.get(id)!);

  const items = orderedLiveIds.map((id) => {
    const p = byId.get(id)!;
    return { id: p.id, label: p.label, icon: p.icon, hidden: hidden.has(id) };
  });

  return {
    renderPanels: [...pinned, ...visible],
    items,
    orderedLiveIds,
  };
}

// Reorder mobile jump-nav chips to match the board arrangement. Chips
// whose panel id isn't in the arrangement (the pinned Ready / Next up
// banners) sort to the front, keeping their relative order; the rest
// follow the resolved panel order. Stable, so the three Deliveries chips
// (same panel id, same rank) stay contiguous. Hidden panels need no
// special-casing here — their DOM node is absent, so NavMenu's
// existence filter drops the chip at open time.
export function sortByArrangement<T extends { id: string; panelId?: string }>(
  sections: T[],
  orderedLiveIds: string[],
): T[] {
  const rank = new Map(orderedLiveIds.map((id, i) => [id, i] as const));
  return [...sections].sort((a, b) => {
    const ra = rank.get(a.panelId ?? a.id);
    const rb = rank.get(b.panelId ?? b.id);
    if (ra === undefined && rb === undefined) return 0;
    if (ra === undefined) return -1;
    if (rb === undefined) return 1;
    return ra - rb;
  });
}

// Rebuild a complete arrangeable order after the visible list was dragged
// into `newVisibleIds`. Hidden ids keep their slots in `orderedLiveIds`;
// visible slots are refilled from the dragged order. Keeps hidden panels
// from snapping back to default when the visible list is rearranged.
export function spliceVisibleOrder(
  orderedLiveIds: string[],
  hidden: string[],
  newVisibleIds: string[],
): string[] {
  const hiddenSet = new Set(hidden);
  let vi = 0;
  return orderedLiveIds.map((id) =>
    hiddenSet.has(id) ? id : (newVisibleIds[vi++] ?? id),
  );
}
