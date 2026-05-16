import { load, save, clear } from "../lib/storage.ts";
import type { Category } from "../timers/types.ts";

const ENABLED_KEY = "sfl-overview:notifications:enabled";
const MUTED_CATEGORIES_KEY = "sfl-overview:notifications:mutedCategories";

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
