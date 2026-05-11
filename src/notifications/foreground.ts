// In-tab notifier: when a timer transitions from non-ready to ready
// in an opted-in category, fire a system notification via the service
// worker registration.
//
// Why use the SW registration instead of `new Notification(...)`:
//   - `registration.showNotification` works inside installed PWAs on
//     Android/desktop where direct `Notification` construction is
//     gated.
//   - The notification is persisted by the SW even if the tab is
//     suspended mid-tick.
//
// Why transition detection (and not "every ready timer on every tick"):
//   - On first paint, every already-ready timer would fire — spammy.
//   - Across farm-data refreshes, new timer rows would also fire even
//     if the player harvested in-game and a fresh planting is somehow
//     already ready (rare but possible). Treating "first time we see
//     this key" as a silent baseline matches user intent: notify when
//     the state *changes under their eyes*, not when we discover it.
//
// Aggregation key matches `aggregate.ts:44` so the dedupe survives
// across re-extraction passes (the `Timer.id` field shifts when the
// underlying plot list changes).

import { useEffect, useRef } from "react";
import {
  type AggregatedTimer,
  type Status,
  statusOf,
} from "../timers/index.ts";
import type { NotifPrefs } from "./prefs.ts";

function keyOf(t: AggregatedTimer): string {
  return t.aggregationKey ?? `${t.category}|${t.label}`;
}

function bodyOf(t: AggregatedTimer): string {
  const parts: string[] = [];
  if (t.count > 1) parts.push(`x${t.count}`);
  if (t.predictedYield) {
    const { amount, item } = t.predictedYield;
    parts.push(`${formatAmount(amount)} ${item}`);
  }
  return parts.join(" · ");
}

function formatAmount(n: number): string {
  // Match the card display style — at most 2 decimals, trim trailing 0s.
  return n.toFixed(2).replace(/\.?0+$/, "");
}

async function fireNotification(t: AggregatedTimer): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(`${t.category}: ${t.label} ready`, {
      body: bodyOf(t),
      icon: t.icon ?? "/icons/sfl_overview-192.webp",
      badge: "/icons/sfl_overview-badge-96.webp",
      tag: keyOf(t),
      data: { url: "/" },
      // `renotify` is widely supported by browsers but missing from the
      // current TS DOM lib; cast through `unknown` so it round-trips.
      ...({ renotify: true } as unknown as NotificationOptions),
    });
  } catch {
    // SW not ready or permission revoked between checks — silent.
  }
}

export function useForegroundNotifier(
  timers: AggregatedTimer[],
  now: number,
  prefs: NotifPrefs,
  permission: "default" | "granted" | "denied" | "unsupported",
): void {
  const lastRef = useRef<Map<string, Status> | null>(null);

  useEffect(() => {
    // Drop the baseline when notifications are disabled so re-enabling
    // doesn't immediately fire for everything currently ready.
    if (!prefs.enabled || permission !== "granted") {
      lastRef.current = null;
      return;
    }

    const prev = lastRef.current;
    const next = new Map<string, Status>();

    for (const t of timers) {
      const key = keyOf(t);
      const status = statusOf(t.readyAt, now);
      next.set(key, status);

      if (status !== "ready") continue;
      const before = prev?.get(key);
      // Fire only on the non-ready → ready transition. `undefined` (new
      // key on this tick) is treated as a silent baseline so initial
      // load doesn't spam.
      if (before === "soon" || before === "later") {
        if (prefs.categories[t.category]) {
          void fireNotification(t);
        }
      }
    }

    lastRef.current = next;
  }, [timers, now, prefs, permission]);
}
