// Shared subscribe-and-register flow used by both NotificationSettings
// (full settings UI) and InstallPromptPanel (the dashboard nag panel).
// Lives outside the components so both call sites stay in sync — when
// we add a new prefs field that needs to ride along on the initial
// /push/subscribe POST, this is the single place to thread it through.

import { postSubscribe } from "./api.ts";
import {
  loadMutedCategories,
  loadNotificationTarget,
  saveEnabled,
  saveLastRegisteredEndpoint,
} from "./prefs.ts";
import {
  getPermissionState,
  requestPermission,
  type PermissionState,
} from "./permission.ts";
import { subscribePush } from "./subscribe.ts";

export type EnableResult =
  | { ok: true; permission: PermissionState }
  | { ok: false; error: string; permission: PermissionState };

export async function enableNotifications(
  farmId: number,
): Promise<EnableResult> {
  let permission: PermissionState;
  try {
    permission = await requestPermission();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
      permission: getPermissionState(),
    };
  }
  if (permission !== "granted") {
    return {
      ok: false,
      permission,
      error:
        permission === "denied"
          ? "Permission denied. Re-enable it in your browser site settings."
          : "Permission not granted.",
    };
  }

  try {
    const sub = await subscribePush();
    if (!sub) {
      return {
        ok: false,
        permission,
        error: "Couldn't create a subscription on this device.",
      };
    }
    const res = await postSubscribe({
      farmId,
      subscription: sub.toJSON() as PushSubscriptionJSON,
      mutedCategories: loadMutedCategories(),
      notificationTarget: loadNotificationTarget(),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        permission,
        error: body.error ?? `Subscribe failed: ${res.status}`,
      };
    }
    saveEnabled(true);
    saveLastRegisteredEndpoint(sub.endpoint);
    return { ok: true, permission };
  } catch (e) {
    return {
      ok: false,
      permission,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
