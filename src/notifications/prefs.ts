import { load, save, clear } from "../lib/storage.ts";
import type { Category } from "../timers/types.ts";

const ENABLED_KEY = "sfl-overview:notifications:enabled";
const MUTED_CATEGORIES_KEY = "sfl-overview:notifications:mutedCategories";
const NOTIFICATION_TARGET_KEY = "sfl-overview:notifications:target";
const LAST_REGISTERED_ENDPOINT_KEY =
  "sfl-overview:notifications:lastRegisteredEndpoint";

export type NotificationTarget = "overview" | "play";

export function loadEnabled(): boolean {
  return load<boolean>(ENABLED_KEY) ?? false;
}
export function saveEnabled(value: boolean): void {
  save(ENABLED_KEY, value);
}
export function clearEnabled(): void {
  clear(ENABLED_KEY);
}

// Storing the *muted* set (not the enabled set) means the default empty
// state == every category enabled, and any category we add upstream is
// automatically opted in — players who already muted things keep their
// existing mutes without re-confirming the new option.
export function loadMutedCategories(): Category[] {
  return load<Category[]>(MUTED_CATEGORIES_KEY) ?? [];
}
export function saveMutedCategories(value: Category[]): void {
  if (value.length === 0) clear(MUTED_CATEGORIES_KEY);
  else save(MUTED_CATEGORIES_KEY, value);
}

// Default is "overview" — preserves the existing behavior for users
// who never touch this setting. Per-device (this storage isn't
// synced across devices, and the server stores it per-subscription).
export function loadNotificationTarget(): NotificationTarget {
  const v = load<string>(NOTIFICATION_TARGET_KEY);
  return v === "play" ? "play" : "overview";
}
export function saveNotificationTarget(value: NotificationTarget): void {
  if (value === "overview") clear(NOTIFICATION_TARGET_KEY);
  else save(NOTIFICATION_TARGET_KEY, value);
}

// Endpoint we last successfully registered with the Worker. Used by the
// mount-effect repair path to detect when the browser silently rotated
// the push subscription (Chrome auto-revoke, push-service expiry, the
// SW's pushsubscriptionchange handler re-subscribing with no clients
// open, etc.) — if the live sub's endpoint differs from this, the
// server is still pushing to a dead endpoint and we need to re-POST
// /push/subscribe.
export function loadLastRegisteredEndpoint(): string | undefined {
  return load<string>(LAST_REGISTERED_ENDPOINT_KEY) ?? undefined;
}
export function saveLastRegisteredEndpoint(value: string): void {
  save(LAST_REGISTERED_ENDPOINT_KEY, value);
}
export function clearLastRegisteredEndpoint(): void {
  clear(LAST_REGISTERED_ENDPOINT_KEY);
}
