import { useCallback, useState } from "react";

// Persists per-section collapsed state across reloads. Each call site
// passes a stable id (typically the same id we stamp on the panel's DOM
// node for nav scroll anchors). New ids default to expanded — we only
// write entries the player has explicitly collapsed, so adding a new
// section never silently hides it.

const KEY = "sfl:collapsed-sections";

type CollapsedMap = Record<string, true>;

function readMap(): CollapsedMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    // Coerce truthy entries only — we never store `false`.
    const out: CollapsedMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v) out[k] = true;
    }
    return out;
  } catch {
    return {};
  }
}

function writeCollapsed(id: string, collapsed: boolean): void {
  try {
    const map = readMap();
    if (collapsed) map[id] = true;
    else delete map[id];
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Quota exceeded or storage disabled — drop silently; the in-memory
    // state still reflects the toggle for this session.
  }
}

export type CollapsibleSection = {
  open: boolean;
  onToggle: (event: React.SyntheticEvent<HTMLDetailsElement>) => void;
};

// Drive a controlled <details> element. Read once on mount so the
// initial render matches the persisted value (no flash of the wrong
// state); subsequent toggles update React state and write through to
// localStorage.
export function useCollapsibleSection(id: string): CollapsibleSection {
  const [open, setOpen] = useState<boolean>(() => !readMap()[id]);
  const onToggle = useCallback(
    (event: React.SyntheticEvent<HTMLDetailsElement>) => {
      const next = event.currentTarget.open;
      setOpen(next);
      writeCollapsed(id, !next);
    },
    [id],
  );
  return { open, onToggle };
}
