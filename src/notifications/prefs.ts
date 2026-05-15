import { load, save, clear } from "../lib/storage.ts";

const ENABLED_KEY = "sfl-overview:notifications:enabled";

export function loadEnabled(): boolean {
  return load<boolean>(ENABLED_KEY) ?? false;
}
export function saveEnabled(value: boolean): void {
  save(ENABLED_KEY, value);
}
export function clearEnabled(): void {
  clear(ENABLED_KEY);
}
