import { useMemo, useState } from "react";

import type { AggregatedTimer } from "../timers/index.ts";
import { statusOf } from "../timers/index.ts";
import type { AnimalResource, AnimalType } from "../game/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatRemaining, formatYield } from "../lib/format.ts";
import { NEXT_UP_SECTION_ID, READY_SECTION_ID } from "./sectionId.ts";
import { InnerPanel, Label } from "./ui/index.ts";

const CHEVRON_DOWN = CHROME_ICONS.chevron_down;

// "Soonest ready" feed. Both panels render as full-width banners at the
// top of the Live Timers page (`layout="banner"`) — a responsive grid
// of rows above the per-category timer column flow.
//
// Row source: each card contributes one row, except multi-slot cards
// (cooking buildings) which contribute one row PER slot — the player
// cares about which recipe is dropping next, not which building owns
// it. Idle timers are skipped.
//
// Limits (banner mode, as rendered today):
// - Ready: every ready row shows on all breakpoints (no toggle) — the
//   wide grid has the room.
// - Next up: desktop shows the full list; mobile caps at
//   NEXT_UP_MOBILE_VISIBLE rows with a "See more" toggle (rotating
//   chevron) that expands to show everything.
//
// `layout="list"` (the legacy single-column form, no longer rendered)
// keeps the older MOBILE_VISIBLE / DESKTOP_VISIBLE caps.

const NEXT_UP_MOBILE_VISIBLE = 10;
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
      layout={layout}
      // Banner shows every ready row up-front (the wide grid has the
      // room), so the caps are lifted and there's no toggle. List mode
      // keeps the 5/10 caps + "Show more" affordance.
      expandable={layout === "list"}
      mobileVisible={layout === "banner" ? Infinity : MOBILE_VISIBLE}
      desktopVisible={layout === "banner" ? Infinity : DESKTOP_VISIBLE}
    />
  );
}

// Like ReadyPanel, `layout="banner"` lays the rows out as a responsive
// grid inside a full-width panel; `layout="list"` (the default) renders
// the legacy single-column list.
export function NextUpPanel({
  timers,
  now,
  layout = "list",
}: Props & { layout?: "list" | "banner" }) {
  const rows = useMemo(
    () => buildRows(timers).filter((r) => r.readyAt > now),
    [timers, now],
  );
  if (rows.length === 0) return null;
  return (
    <RowList
      id={NEXT_UP_SECTION_ID}
      title="Next up"
      rows={rows}
      now={now}
      layout={layout}
      // Banner: desktop shows the full list; mobile caps at
      // NEXT_UP_MOBILE_VISIBLE with a "See more" toggle that expands to
      // everything. List mode falls back to the legacy 5/10 caps.
      expandable
      mobileVisible={
        layout === "banner" ? NEXT_UP_MOBILE_VISIBLE : MOBILE_VISIBLE
      }
      desktopVisible={layout === "banner" ? Infinity : DESKTOP_VISIBLE}
    />
  );
}

type RowListProps = {
  id: string;
  title: string;
  rows: Row[];
  now: number;
  expandable?: boolean;
  layout?: "list" | "banner";
  // Rows past these indices are hidden until expanded. `Infinity` means
  // "no cap" — show every row on that breakpoint.
  mobileVisible?: number;
  desktopVisible?: number;
};

function RowList({
  id,
  title,
  rows,
  now,
  expandable,
  layout = "list",
  mobileVisible = MOBILE_VISIBLE,
  desktopVisible = DESKTOP_VISIBLE,
}: RowListProps) {
  const [expanded, setExpanded] = useState(false);
  // Rows past `mobileVisible` are hidden below `sm`; rows past
  // `desktopVisible` are hidden at `sm+` too. Expanding drops both
  // caps. A cap of `Infinity` shows every row on that breakpoint. The
  // "Show more" toggle only appears when `expandable` and there's
  // overflow at the relevant breakpoint.
  const hasMobileOverflow = expandable && rows.length > mobileVisible;
  const hasDesktopOverflow = expandable && rows.length > desktopVisible;
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
          // `hidden` past the desktop cap; `hidden sm:flex` between the
          // mobile and desktop caps (hidden on phones, shown at `sm+`).
          // Banner rows are grid items, but toggling `display` to
          // none/flex on an item still shows/hides it within the grid.
          let visibilityClass = "";
          if (!expanded) {
            if (idx >= desktopVisible) visibilityClass = "hidden";
            else if (idx >= mobileVisible) visibilityClass = "hidden sm:flex";
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
