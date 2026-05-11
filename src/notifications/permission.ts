// Thin wrapper around the Notification permission state. Exposed as a
// React hook so the settings UI re-renders when the user grants/denies.
// The Permissions API would let us listen via `onchange`, but Safari
// gates Notification permissions out of it — falling back to manual
// polling on focus covers every supported browser.

import { useEffect, useState } from "react";

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

export function getPermission(): PermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestPermission(): Promise<PermissionState> {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  const result = await Notification.requestPermission();
  return result;
}

export function useNotificationPermission(): PermissionState {
  const [state, setState] = useState<PermissionState>(() => getPermission());

  useEffect(() => {
    const sync = () => setState(getPermission());
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return state;
}
