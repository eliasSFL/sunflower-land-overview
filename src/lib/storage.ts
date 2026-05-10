// Tiny localStorage wrapper with a 7-day TTL so stale farm/api credentials
// don't pin forever after a player rotates them.

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Entry<T> = { v: T; at: number };

export function load<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (Date.now() - parsed.at > TTL_MS) {
      localStorage.removeItem(key);
      return undefined;
    }
    return parsed.v;
  } catch {
    return undefined;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v: value, at: Date.now() }));
  } catch {
    // Quota exceeded or storage disabled — ignore.
  }
}

export function clear(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}
