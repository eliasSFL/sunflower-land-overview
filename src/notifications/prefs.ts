import { load, save, clear } from "../lib/storage.ts";
import { CATEGORY_ORDER } from "../timers/types.ts";
import type { CategoryPrefs } from "./api.ts";

const ENABLED_KEY = "sfl-overview:notifications:enabled";
const CATEGORIES_KEY = "sfl-overview:notifications:categories";

export function loadEnabled(): boolean {
  return load<boolean>(ENABLED_KEY) ?? false;
}
export function saveEnabled(value: boolean): void {
  save(ENABLED_KEY, value);
}
export function clearEnabled(): void {
  clear(ENABLED_KEY);
}

// Default: every category on once notifications are enabled. Users
// uncheck what they don't want.
export function loadCategories(): CategoryPrefs {
  const stored = load<CategoryPrefs>(CATEGORIES_KEY);
  if (stored) return stored;
  const all: CategoryPrefs = {};
  for (const c of CATEGORY_ORDER) all[c] = true;
  return all;
}
export function saveCategories(value: CategoryPrefs): void {
  save(CATEGORIES_KEY, value);
}
