import { useMemo, useState } from "react";

import type { AggregatedTimer } from "../timers/index.ts";
import { statusOf } from "../timers/index.ts";
import type { AnimalResource, AnimalType } from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatRemaining, formatYield } from "../lib/format.ts";
import { NEXT_UP_SECTION_ID, READY_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

const CHEVRON_DOWN = CHROME_ICONS.chevron_down;

// Compact "next ready" feed shown under the Farm ID panel. Fills the
// dead space on desktop while staying useful on mobile.
//
// Row source: each card contributes one row, except multi-slot cards
// (cooking buildings) which contribute one row PER slot — the player
// cares about which recipe is dropping next, not which building owns
// it. Idle timers are skipped.
//
// Limits:
// - Ready panel renders every ready row; only the first 5 are visible
//   on mobile (`< sm`) and the first 10 on desktop (`sm+`). A
//   "Show more" toggle with a rotating chevron reveals the rest.
// - Next up panel keeps the original cap of 10 rows total with rows
//   5–9 hidden below `sm` (no toggle) so phones see a tight widget.

const MAX_ROWS = 10;
const MOBILE_VISIBLE = 5;
const DESKTOP_VISIBLE = 10;
// Rows with the same (source, item) that come ready within this window
// of an already-shown row are collapsed — keeps multiple Salt nodes (or
// multiple identical cooking slots) from monopolising the feed when
// they all finish around the same time.
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;

type Row = {
  key: string;
  icon?: string;
  label: string;
  amount: number;
  readyAt: number;
  // Small text rendered under the row's item — disambiguates items that
  // appear in multiple categories (e.g. Potato shows up in Crops AND in
  // a Crop Machine pack). For multi-slot timers we surface the parent's
  // label (the building name, e.g. "Fire Pit") instead of "Cooking" so
  // the player can tell which building owns the slot.
  source: string;
  // Set by the dedupe pass — number of rows collapsed into this one
  // because they shared (source, label) and came ready within
  // DEDUPE_WINDOW_MS. 1 means no collapse; the suffix is hidden.
  count: number;
};

const STATUS_LABEL = {
  ready: "success",
  soon: "warning",
  later: "info",
} as const;

// Animal cards live in a single "Animals" category but each row's
// resource maps unambiguously to one animal type — surface that as the
// source so a row reads "Egg / Chicken" instead of "Egg / Animals".
const ANIMAL_BY_RESOURCE: Record<AnimalResource, AnimalType> = {
  Egg: "Chicken",
  Feather: "Chicken",
  Milk: "Cow",
  Leather: "Cow",
  Wool: "Sheep",
  "Merino Wool": "Sheep",
};

const isAnimalResource = (label: string): label is AnimalResource =>
  label in ANIMAL_BY_RESOURCE;

function buildRows(timers: AggregatedTimer[]): Row[] {
  const rows: Row[] = [];
  for (const t of timers) {
    if (t.idle) continue;
    if (t.slots && t.slots.length > 0) {
      t.slots.forEach((slot, i) => {
        rows.push({
          key: `${t.id}:slot:${i}`,
          icon: slot.icon,
          label: slot.item,
          amount: slot.amount,
          readyAt: slot.readyAt,
          source: t.label,
          count: 1,
        });
      });
      continue;
    }
    const itemLabel = t.predictedYield?.item ?? t.label;
    const source =
      t.category === "Animals" && isAnimalResource(itemLabel)
        ? ANIMAL_BY_RESOURCE[itemLabel]
        : t.category;
    rows.push({
      key: t.id,
      icon: t.icon,
      label: itemLabel,
      amount: t.predictedYield?.amount ?? 0,
      readyAt: t.readyAt,
      source,
      count: 1,
    });
  }
  rows.sort((a, b) => a.readyAt - b.readyAt);

  // Dedupe: collapse rows sharing (source, label) that come ready
  // within DEDUPE_WINDOW_MS of an already-kept row. The kept row gets
  // its `count` bumped so the render layer can show "× N".
  const deduped: Row[] = [];
  const lastKeptIdx = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.source}|${row.label}`;
    const idx = lastKeptIdx.get(key);
    if (
      idx !== undefined &&
      row.readyAt - deduped[idx].readyAt < DEDUPE_WINDOW_MS
    ) {
      deduped[idx].count += 1;
      continue;
    }
    deduped.push(row);
    lastKeptIdx.set(key, deduped.length - 1);
  }

  return deduped;
}

type Props = {
  timers: AggregatedTimer[];
  now: number;
};

// `layout="banner"` lays the rows out as a responsive grid (1 col on
// mobile, up to 4 on wide desktops) inside a full-width panel — used
// at the top of the Live Timers page where the panel spans the whole
// row above the column flow. `layout="list"` (the default) renders
// the legacy single-column list used elsewhere.
export function ReadyPanel({
  timers,
  now,
  layout = "list",
}: Props & { layout?: "list" | "banner" }) {
  const rows = useMemo(
    () => buildRows(timers).filter((r) => r.readyAt <= now),
    [timers, now],
  );
  if (rows.length === 0) return null;
  return (
    <RowList
      id={READY_SECTION_ID}
      title="Ready"
      rows={rows}
      now={now}
      // Banner mode shows every row up-front (the wide grid has the
      // room) — only the list mode keeps the expandable "Show more"
      // affordance.
      expandable={layout === "list"}
      layout={layout}
    />
  );
}

export function NextUpPanel({ timers, now }: Props) {
  const rows = useMemo(
    () =>
      buildRows(timers)
        .filter((r) => r.readyAt > now)
        .slice(0, MAX_ROWS),
    [timers, now],
  );
  if (rows.length === 0) return null;
  return (
    <RowList id={NEXT_UP_SECTION_ID} title="Next up" rows={rows} now={now} />
  );
}

type RowListProps = {
  id: string;
  title: string;
  rows: Row[];
  now: number;
  expandable?: boolean;
  layout?: "list" | "banner";
};

function RowList({
  id,
  title,
  rows,
  now,
  expandable,
  layout = "list",
}: RowListProps) {
  const [expanded, setExpanded] = useState(false);
  // Below `sm` only the first 5 rows render; at `sm+` only the first
  // 10. When the user expands, the caps are dropped on both
  // breakpoints. NextUpPanel doesn't pass `expandable`, so its rows
  // can't be expanded — but it slices to 10 upstream, so the desktop
  // cap is a no-op there.
  //
  // Banner mode doesn't pass `expandable`, so both flags collapse to
  // false and every row renders — the responsive grid below provides
  // the horizontal room to absorb them.
  const hasMobileOverflow = expandable && rows.length > MOBILE_VISIBLE;
  const hasDesktopOverflow = expandable && rows.length > DESKTOP_VISIBLE;
  return (
    <InnerPanel id={id} className="flex scroll-mt-4 flex-col gap-2">
      <header>
        <Label type="default">{title}</Label>
      </header>
      <ul
        className={
          layout === "banner"
            ? // Banner mode: a CSS grid whose column count tracks the
              // outer page grid (1 → 2 → 3 → 4). Each row becomes a
              // tile inside the banner. `display: grid` overrides the
              // per-row `flex` visibility classes so we keep using the
              // same row markup as list mode.
              "grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
            : "flex flex-col gap-1"
        }
      >
        {rows.map((row, idx) => {
          const status = statusOf(row.readyAt, now);
          // Visibility caps only apply in list mode — banner mode
          // renders every row up-front (the wide grid has the room).
          let visibilityClass = "";
          if (!expanded && layout === "list") {
            if (idx >= DESKTOP_VISIBLE) visibilityClass = "hidden";
            else if (idx >= MOBILE_VISIBLE) visibilityClass = "hidden sm:flex";
          }
          return (
            <li
              key={row.key}
              className={`flex ${visibilityClass} items-center justify-between gap-2`}
            >
              <span className="flex items-center gap-1 min-w-0">
                {row.icon ? (
                  <img
                    src={row.icon}
                    alt=""
                    aria-hidden
                    className="h-5 w-5 shrink-0 object-contain"
                  />
                ) : null}
                <span className="flex flex-col min-w-0">
                  <span className="text-xs truncate">
                    {row.amount > 0
                      ? `${formatYield(row.amount)} ${row.label}`
                      : row.label}
                    {row.count > 1 ? (
                      <span className="opacity-60"> ×{row.count}</span>
                    ) : null}
                  </span>
                  <span className="text-xs opacity-60 truncate">
                    {row.source}
                  </span>
                </span>
              </span>
              <Label type={STATUS_LABEL[status]}>
                {formatRemaining(row.readyAt - now)}
              </Label>
            </li>
          );
        })}
      </ul>
      {hasMobileOverflow ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`flex items-center gap-1 self-center text-xs opacity-70 hover:opacity-100 cursor-pointer ${hasDesktopOverflow ? "" : "sm:hidden"}`}
        >
          <span>{expanded ? "Hide" : "Show more"}</span>
          <img
            src={CHEVRON_DOWN}
            alt=""
            aria-hidden
            className={`h-auto w-5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            style={{ imageRendering: "pixelated" }}
          />
        </button>
      ) : null}
    </InnerPanel>
  );
}
