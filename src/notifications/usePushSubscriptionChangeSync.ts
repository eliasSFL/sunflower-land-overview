import { useEffect } from "react";

import { enableNotifications } from "./enable.ts";
import { loadEnabled } from "./prefs.ts";

// Listens for the SW's `pushsubscriptionchange` relay message and
// re-runs the subscribe flow so the new endpoint gets registered with
// the Worker against the current farm + mute/target prefs. The SW only
// has the new PushSubscription; the SPA has the prefs (localStorage)
// and the farm id (props), so the actual /push/subscribe POST has to
// happen here.
//
// `enableNotifications` calls `requestPermission()`, which is a no-op
// when permission is already granted — no UI prompt fires. The repair
// short-circuits if permission has actually been revoked, matching the
// mount-effect path in NotificationSettings.
export function usePushSubscriptionChangeSync(
  farmId: number | undefined,
): void {
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
      void enableNotifications(farmId);
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handler);
    };
  }, [farmId]);
}
