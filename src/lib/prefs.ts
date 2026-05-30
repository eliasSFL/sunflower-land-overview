// Persistent user-preference store. Unlike `storage.ts` (which carries a
// 7-day TTL so rotated farm/api credentials don't pin forever), prefs are
// durable: a player's panel arrangement should survive indefinitely, not
// silently reset after a week of not visiting. Same localStorage backend,
// no expiry envelope.

export function loadPref<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function savePref<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled — ignore.
  }
}

export function clearPref(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}
