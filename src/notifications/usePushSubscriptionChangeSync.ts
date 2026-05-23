import { useEffect } from "react";

import { enableNotifications } from "./enable.ts";
import { getPermissionState } from "./permission.ts";
import { getExistingSubscription } from "./subscribe.ts";
import { loadEnabled, loadLastRegisteredEndpoint } from "./prefs.ts";

// Recovers push notifications from silent invalidation without waiting
// for the player to open the Settings modal. Two paths:
//
//   1. One-shot mount reconciliation (the "dashboard open all day"
//      case). If localStorage says enabled + permission is still
//      granted, but either no live PushSubscription exists OR the
//      live one's endpoint differs from the one we last registered,
//      re-run the subscribe flow. Covers:
//        - browser dropped the sub while the app was closed (Chrome
//          auto-revoke, push-service expiry, storage eviction)
//        - SW's `pushsubscriptionchange` re-subscribed but no clients
//          were open to receive the postMessage relay
//
//   2. SW relay listener. `pushsubscriptionchange` fires in the SW
//      when the browser re-issues the sub; the SW posts a message to
//      open clients so we can register the new endpoint immediately
//      without waiting for the next page load. The mount path above
//      catches anything we miss here.
//
// `enableNotifications` calls `requestPermission()`, which is a silent
// no-op when permission is already granted — no UI prompt fires.
// Failures from this background recovery have no UI surface (the
// player isn't in Settings); a console.warn at least makes them
// debuggable when a player reports pushes not arriving.
export function usePushSubscriptionChangeSync(
  farmId: number | undefined,
): void {
  useEffect(() => {
    if (farmId === undefined) return;
    let cancelled = false;
    (async () => {
      const sub = await getExistingSubscription();
      if (cancelled) return;
      const flag = loadEnabled();
      const perm = getPermissionState();
      const lastEndpoint = loadLastRegisteredEndpoint();
      const needsRepair =
        flag &&
        perm === "granted" &&
        (sub === null || sub.endpoint !== lastEndpoint);
      if (!needsRepair) return;
      const result = await enableNotifications(farmId);
      if (cancelled) return;
      if (!result.ok) {
        console.warn(
          "[notifications] silent recovery on mount failed:",
          result.error,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  useEffect(() => {
    if (farmId === undefined) return;
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type !== "pushsubscriptionchange") return;
      // Only re-register if the player had notifications enabled.
      // Otherwise the SW's silent re-subscribe shouldn't drag them
      // back into a subscribed state they didn't ask for.
      if (!loadEnabled()) return;
      void enableNotifications(farmId).then((result) => {
        if (!result.ok) {
          console.warn(
            "[notifications] SW-relay recovery failed:",
            result.error,
          );
        }
      });
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handler);
    };
  }, [farmId]);
}
