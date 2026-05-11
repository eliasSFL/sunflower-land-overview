// Per-device notification preferences. Stored in localStorage via the
// shared `lib/storage.ts` wrapper (7-day TTL) so a user who never opens
// the page again eventually stops being treated as opted in.
//
// `Category` is re-exported from the timers module — never redefined.
// See CLAUDE.md: types that exist upstream are imported, not duplicated.

import { CATEGORY_ORDER, type Category } from "../timers/index.ts";
import * as storage from "../lib/storage.ts";

const PREFS_KEY = "sfl-overview:notif-prefs";

export type NotifPrefs = {
  enabled: boolean;
  categories: Record<Category, boolean>;
};

function defaultPrefs(): NotifPrefs {
  const categories = Object.fromEntries(
    CATEGORY_ORDER.map((c) => [c, true]),
  ) as Record<Category, boolean>;
  return { enabled: false, categories };
}

export function loadPrefs(): NotifPrefs {
  const stored = storage.load<NotifPrefs>(PREFS_KEY);
  if (!stored) return defaultPrefs();
  // Defensively backfill any category the user hasn't seen yet (the
  // upstream may add new ones) — without this, a missing key behaves
  // like `false` and silently mutes that category.
  const merged = { ...defaultPrefs().categories, ...stored.categories };
  return { enabled: stored.enabled, categories: merged };
}

export function savePrefs(prefs: NotifPrefs): void {
  storage.save(PREFS_KEY, prefs);
}
