// API key storage with a 7-day TTL.
// We store `{ value, savedAt }` as JSON; on read, anything older than the TTL
// is treated as absent (and removed). Farm ID has no TTL — it's not sensitive.

const API_KEY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const STORAGE_KEYS = {
  farmId: "sl-overview:farmId",
  apiKey: "sl-overview:apiKey",
} as const;

type StoredKey = { value: string; savedAt: number };

export function loadFarmId(): string {
  return localStorage.getItem(STORAGE_KEYS.farmId) ?? "";
}

export function saveFarmId(id: string): void {
  localStorage.setItem(STORAGE_KEYS.farmId, id);
}

export function clearFarmId(): void {
  localStorage.removeItem(STORAGE_KEYS.farmId);
}

export function loadApiKey(): string {
  const raw = localStorage.getItem(STORAGE_KEYS.apiKey);
  if (!raw) return "";

  let parsed: StoredKey;
  try {
    parsed = JSON.parse(raw) as StoredKey;
  } catch {
    // Legacy plain-string entry from before TTL was added — drop it.
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    return "";
  }

  if (
    !parsed ||
    typeof parsed.value !== "string" ||
    typeof parsed.savedAt !== "number"
  ) {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    return "";
  }

  if (Date.now() - parsed.savedAt > API_KEY_TTL_MS) {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
    return "";
  }

  return parsed.value;
}

export function saveApiKey(value: string): void {
  const entry: StoredKey = { value, savedAt: Date.now() };
  localStorage.setItem(STORAGE_KEYS.apiKey, JSON.stringify(entry));
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEYS.apiKey);
}

/** ms remaining before the stored API key expires; null if none stored. */
export function apiKeyExpiresIn(): number | null {
  const raw = localStorage.getItem(STORAGE_KEYS.apiKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredKey;
    if (typeof parsed.savedAt !== "number") return null;
    return Math.max(0, parsed.savedAt + API_KEY_TTL_MS - Date.now());
  } catch {
    return null;
  }
}
