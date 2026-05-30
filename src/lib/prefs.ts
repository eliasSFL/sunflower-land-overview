// Persistent user-preference store. Unlike `storage.ts` (which carries a
// 7-day TTL so rotated farm/api credentials don't pin forever), prefs are
// durable: a player's panel arrangement should survive indefinitely, not
// silently reset after a week of not visiting. Same localStorage backend,
// no expiry envelope.

// `validator` guards against malformed/legacy payloads: a stored value that
// no longer matches the expected shape (or isn't even an object) would
// otherwise be cast blindly to T and crash downstream. When it fails — or
// when JSON is unparseable — the corrupted entry is dropped so it can't keep
// breaking every load. Without a validator we still require a non-null object.
export function loadPref<T>(
  key: string,
  validator?: (v: unknown) => v is T,
): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    const valid = validator
      ? validator(parsed)
      : typeof parsed === "object" && parsed !== null;
    if (valid) return parsed as T;
    localStorage.removeItem(key);
    return undefined;
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
