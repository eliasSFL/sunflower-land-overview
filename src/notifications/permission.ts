// Browser permission state + iOS standalone detection. iOS Safari only
// hands out Web Push when the PWA has been added to the home screen
// (Apple's installability gate); on Android Chrome any installed or
// browser context works.

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

export function getPermissionState(): PermissionState {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as PermissionState;
}

export async function requestPermission(): Promise<PermissionState> {
  if (typeof Notification === "undefined") return "unsupported";
  const result = await Notification.requestPermission();
  return result as PermissionState;
}

export function isIOS(): boolean {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window)) {
    return true;
  }
  // iPadOS 13+ defaults to a desktop-class UA (reports "Macintosh"),
  // hiding the device family entirely. Catch it via maxTouchPoints:
  // Apple doesn't ship touch Macs, so >1 touch point on a Mac-like
  // platform string is reliably an iPad. Without this, iPad-on-Safari
  // users pass canSubscribe() and then fail opaquely at
  // pushManager.subscribe() because Apple still requires home-screen
  // install on iPadOS 16.4+ exactly like iOS — the Install Required
  // copy in NotificationSettings would otherwise be skipped for them.
  return navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform);
}

export function isStandalone(): boolean {
  // iOS uses the non-standard `navigator.standalone`; Android/desktop
  // expose the display-mode media query.
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

// True when push subscription can succeed in the current context.
export function canSubscribe(): boolean {
  if (typeof Notification === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (isIOS() && !isStandalone()) return false;
  return true;
}
