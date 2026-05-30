import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PanelDescriptor } from "../app/panelRegistry.tsx";
import {
  EMPTY_ARRANGEMENT,
  isArrangement,
  resolveArrangement,
  spliceVisibleOrder,
  type Arrangement,
} from "../app/panelOrder.ts";
import { clearPref, loadPref, savePref } from "../lib/prefs.ts";

export type PanelArrangement = ReturnType<typeof usePanelArrangement>;

// Time-independent slice handed to the Arrange sheet: the panel metadata
// list + mutation handlers. Deliberately excludes `renderPanels` (whose
// thunks capture `now` and so change every second) and is memoized to a
// stable identity, so the sheet can sit behind React.memo and skip the
// app's 1 Hz re-render entirely. See the comment block in the hook body.
export type PanelSheet = {
  items: ReturnType<typeof resolveArrangement>["items"];
  reorderVisible: (newVisibleIds: string[]) => void;
  toggleHidden: (id: string) => void;
  reset: () => void;
};

// Owns one page's panel arrangement: reads the persisted order/hidden set,
// reconciles it against the live panel list every render, and exposes the
// render order plus mutation handlers. Persistence is durable (no TTL) via
// `prefs.ts` — a layout shouldn't expire like a credential does.
//
// Lives once per page in App. The page renders `renderPanels` (refreshed
// every tick for live countdowns); the Arrange sheet reads `sheet` (stable
// across ticks) — so the sheet never re-renders just because the clock
// advanced.
export function usePanelArrangement(
  pageKey: string,
  livePanels: PanelDescriptor[],
) {
  const storageKey = `panel-arrangement:${pageKey}`;
  const [saved, setSaved] = useState<Arrangement>(
    () => loadPref<Arrangement>(storageKey, isArrangement) ?? EMPTY_ARRANGEMENT,
  );

  const resolved = useMemo(
    () => resolveArrangement(saved, livePanels),
    [saved, livePanels],
  );

  const persist = useCallback(
    (next: Arrangement) => {
      setSaved(next);
      savePref(storageKey, next);
    },
    [storageKey],
  );

  // The handlers below read the resolved order + hidden set, both of which
  // get a fresh identity on every render (the 1 Hz `now` tick rebuilds
  // `livePanels` upstream). Threading them through useCallback deps would
  // make the callbacks change every second, defeating the React.memo on
  // the Arrange sheet rows. Instead we stash the latest values in a ref so
  // the callbacks can stay referentially stable across renders.
  const latest = useRef({
    orderedLiveIds: resolved.orderedLiveIds,
    hidden: saved.hidden,
  });
  // Sync in an effect (not during render) so the ref read stays lint-clean.
  // Callbacks only fire from user events, which run after commit + effects,
  // so `latest.current` is always up to date by the time one reads it.
  useEffect(() => {
    latest.current = {
      orderedLiveIds: resolved.orderedLiveIds,
      hidden: saved.hidden,
    };
  });

  // `newVisibleIds` is the visible list after a drag. Hidden panels keep
  // their slots (spliceVisibleOrder), so reordering what you can see never
  // disturbs what you've tucked away.
  const reorderVisible = useCallback(
    (newVisibleIds: string[]) => {
      const { orderedLiveIds, hidden } = latest.current;
      persist({
        order: spliceVisibleOrder(orderedLiveIds, hidden, newVisibleIds),
        hidden,
      });
    },
    [persist],
  );

  const toggleHidden = useCallback(
    (id: string) => {
      const { orderedLiveIds, hidden: current } = latest.current;
      const hidden = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      // Persist the resolved order alongside, so the freshly toggled panel
      // keeps an explicit slot rather than depending on default merge.
      persist({ order: orderedLiveIds, hidden });
    },
    [persist],
  );

  const reset = useCallback(() => {
    setSaved(EMPTY_ARRANGEMENT);
    clearPref(storageKey);
  }, [storageKey]);

  // `resolved` is a fresh object every tick (livePanels rebuilds with
  // `now`), but the bits the sheet + nav care about — the metadata list
  // and the id order — only change when the player edits the layout or a
  // category appears/disappears. Re-key them on content so their identity
  // is stable across ticks; otherwise the sheet (and the nav-sort memos in
  // App) would churn once a second.
  const itemsKey = resolved.items
    .map((i) => `${i.id}:${i.hidden ? 1 : 0}`)
    .join("|");
  // itemsKey is the content hash of resolved.items; depending on the array
  // itself would defeat the memo (new identity every tick).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => resolved.items, [itemsKey]);

  const orderedKey = resolved.orderedLiveIds.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- see itemsKey.
  const orderedLiveIds = useMemo(() => resolved.orderedLiveIds, [orderedKey]);

  // The stable bundle for the Arrange sheet. Every field here is now
  // referentially stable across the 1 Hz tick (handlers via refs above,
  // items via the content key), so `sheet` itself is too.
  const sheet = useMemo<PanelSheet>(
    () => ({ items, reorderVisible, toggleHidden, reset }),
    [items, reorderVisible, toggleHidden, reset],
  );

  // `renderPanels` stays fresh each tick — the page needs the up-to-date
  // render thunks for live countdowns. `orderedLiveIds` feeds the nav sort.
  return { renderPanels: resolved.renderPanels, orderedLiveIds, sheet };
}
