import { useMemo } from "react";

import type { GameState } from "../game/index.ts";
import { buildIdleEntries } from "../lib/idle.ts";
import type { AggregatedTimer } from "../timers/index.ts";
import { getCategoryIcon } from "./categoryIcon.ts";
import { IDLE_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

type Props = {
  state: GameState;
  byCategory: Map<string, AggregatedTimer[]>;
  now: number;
};

// At-a-glance "what could I be doing right now?" panel — one row per
// category that has free capacity (empty plots, idle buildings, free
// queue slots). Hidden when nothing is idle.
export function IdlePanel({ state, byCategory, now }: Props) {
  const entries = useMemo(
    () => buildIdleEntries(state, byCategory, now),
    [state, byCategory, now],
  );

  if (entries.length === 0) return null;

  return (
    <InnerPanel
      id={IDLE_SECTION_ID}
      className="flex scroll-mt-4 flex-col gap-2"
    >
      <header>
        <Label type="default">Idle</Label>
      </header>
      <ul className="flex flex-col gap-1">
        {entries.map(({ category, message }) => (
          <li key={category} className="flex items-center gap-2 min-w-0">
            <img
              src={getCategoryIcon(category)}
              alt=""
              aria-hidden
              className="h-5 w-5 shrink-0 object-contain"
            />
            <span className="flex flex-col min-w-0">
              <span className="text-xs truncate">{category}</span>
              <span className="text-xs opacity-60 truncate">{message}</span>
            </span>
          </li>
        ))}
      </ul>
    </InnerPanel>
  );
}
