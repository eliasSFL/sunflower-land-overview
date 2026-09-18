import { useId, useState } from "react";

import { formatCompact } from "../lib/format.ts";

// The marketplace page's two charts.
//
// PLOT SURFACE. Both sit on a dark inset (`PLOT_SURFACE`) rather than
// the panel's tan (`#c28569`), because on the tan NOTHING in the game's
// palette clears a 3:1 contrast ratio — the surface is mid-lightness,
// so mid-lightness marks vanish into it (measured: the best of the five
// label hues manages 1.63:1). The dark inset is the page ground the
// dashboard already uses, so it reads as an in-game screen rather than
// a foreign element, and it takes the marks cleanly.
//
// SERIES HUE. One hue, `#1e6dd5` — the game's own "info" blue —
// verified against that surface for both the dark lightness band and
// the 3:1 contrast floor. Both charts are single-series, so there is no
// legend (the heading names what is plotted) and no categorical
// separation to worry about.
//
// ONE AXIS, ALWAYS. The trend plots FLOWER volume; the history plots
// FLOWER price per unit. Trade counts and sale counts are real data but
// a different scale, so they live in the tooltip and the table, never
// on a second y-axis.

const PLOT_SURFACE = "#181425";
const SERIES = "#1e6dd5";
/** Recessive one-step-off-surface grid, per the mark specs. */
const GRID = "rgba(226, 232, 240, 0.14)";
const AXIS_INK = "rgba(226, 232, 240, 0.65)";
const INK = "#e2e8f0";

/** Round a max up to a clean number so axis ticks read as round values. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function TooltipBox({
  x,
  y,
  width,
  lines,
}: {
  x: number;
  y: number;
  width: number;
  lines: string[];
}) {
  const boxWidth = 104;
  // Flip to the left of the anchor when it would overflow the plot.
  const left = x + boxWidth + 8 > width ? x - boxWidth - 8 : x + 8;
  const height = 14 + lines.length * 12;

  return (
    <g pointerEvents="none">
      <rect
        x={left}
        y={y}
        width={boxWidth}
        height={height}
        rx={3}
        fill="rgba(11, 18, 32, 0.95)"
        stroke={GRID}
      />
      {lines.map((line, i) => (
        <text
          key={line}
          x={left + 6}
          y={y + 15 + i * 12}
          fill={INK}
          fontSize={9}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

export type TrendPoint = { date: string; volume: number; trades: number };

/**
 * Daily FLOWER volume across the whole market. A single series over
 * time, so: 2px line, a ~10% wash beneath it, an end marker with a 2px
 * surface ring, and only the final point directly labelled.
 */
export function MarketTrendChart({ points }: { points: TrendPoint[] }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  // Two points is the minimum that can describe a trend; one is a dot.
  if (points.length < 2) return null;

  const width = 320;
  const height = 96;
  const padLeft = 34;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 18;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const max = niceCeiling(Math.max(...points.map((p) => p.volume)));
  const xOf = (i: number) =>
    padLeft + (points.length === 1 ? 0 : (i / (points.length - 1)) * plotW);
  const yOf = (v: number) => padTop + plotH - (v / max) * plotH;

  const line = points.map((p, i) => `${xOf(i)},${yOf(p.volume)}`).join(" ");
  const area = `${padLeft},${padTop + plotH} ${line} ${padLeft + plotW},${padTop + plotH}`;

  const last = points[points.length - 1];
  const active = hover === null ? null : points[hover];

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        role="img"
        aria-label={`Daily marketplace volume over the last ${points.length} days, in FLOWER`}
        style={{ background: PLOT_SURFACE, borderRadius: 3 }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES} stopOpacity={0.28} />
            <stop offset="100%" stopColor={SERIES} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Baseline + midline only — gridlines stay recessive and few. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={padLeft}
            x2={padLeft + plotW}
            y1={padTop + plotH * f}
            y2={padTop + plotH * f}
            stroke={GRID}
            strokeWidth={1}
          />
        ))}
        <text x={2} y={padTop + 4} fill={AXIS_INK} fontSize={8}>
          {formatCompact(max)}
        </text>
        <text x={2} y={padTop + plotH} fill={AXIS_INK} fontSize={8}>
          0
        </text>

        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke={SERIES}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* End marker: r=4 (8px) with a 2px surface ring so it stays
            legible where it sits on the line. */}
        <circle
          cx={xOf(points.length - 1)}
          cy={yOf(last.volume)}
          r={4}
          fill={SERIES}
          stroke={PLOT_SURFACE}
          strokeWidth={2}
        />

        {/* Crosshair + per-day hit targets, each wider than the mark. */}
        {active !== null && hover !== null ? (
          <line
            x1={xOf(hover)}
            x2={xOf(hover)}
            y1={padTop}
            y2={padTop + plotH}
            stroke={GRID}
            strokeWidth={1}
          />
        ) : null}
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={xOf(i) - plotW / (points.length * 2)}
            y={padTop}
            width={plotW / points.length}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {active !== null && hover !== null ? (
          <TooltipBox
            x={xOf(hover)}
            y={padTop}
            width={width}
            lines={[
              active.date.slice(5),
              `${formatCompact(active.volume)} FLOWER`,
              `${active.trades} trades`,
            ]}
          />
        ) : (
          // Only the endpoint is directly labelled — a value on every
          // point would be noise.
          <text
            x={xOf(points.length - 1)}
            y={yOf(last.volume) - 8}
            fill={INK}
            fontSize={9}
            textAnchor="end"
          >
            {formatCompact(last.volume)}
          </text>
        )}
      </svg>
    </figure>
  );
}

export type HistoryDay = {
  date: string;
  low: number;
  high: number;
  volume: number;
  sales: number;
};

/**
 * One item's daily price range. Each day is a low–high range column in
 * the series hue — the honest form for data that is a span rather than
 * a point, and it keeps the single price axis. Volume and sale counts
 * ride the tooltip.
 */
export function ItemHistoryChart({ days }: { days: HistoryDay[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (days.length === 0) return null;

  const width = 320;
  const height = 96;
  const padLeft = 34;
  const padRight = 10;
  const padTop = 10;
  const padBottom = 18;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const max = niceCeiling(Math.max(...days.map((d) => d.high)));
  const slot = plotW / days.length;
  // <=24px thick, and never the whole slot — the leftover is the air
  // that separates neighbouring columns.
  const barW = Math.min(24, slot * 0.55);
  const yOf = (v: number) => padTop + plotH - (v / max) * plotH;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        role="img"
        aria-label={`Daily price range over ${days.length} days, in FLOWER per unit`}
        style={{ background: PLOT_SURFACE, borderRadius: 3 }}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={padLeft}
            x2={padLeft + plotW}
            y1={padTop + plotH * f}
            y2={padTop + plotH * f}
            stroke={GRID}
            strokeWidth={1}
          />
        ))}
        <text x={2} y={padTop + 4} fill={AXIS_INK} fontSize={8}>
          {formatCompact(max)}
        </text>
        <text x={2} y={padTop + plotH} fill={AXIS_INK} fontSize={8}>
          0
        </text>

        {days.map((d, i) => {
          const cx = padLeft + slot * i + slot / 2;
          const top = yOf(d.high);
          // A day whose low and high match is a single price, not a
          // range — give it a visible 2px cap rather than a zero-height
          // rect that disappears.
          const barH = Math.max(2, yOf(d.low) - top);
          return (
            <g key={d.date}>
              <rect
                x={cx - barW / 2}
                y={top}
                width={barW}
                height={barH}
                rx={2}
                fill={SERIES}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
              <rect
                x={padLeft + slot * i}
                y={padTop}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}

        {hover !== null ? (
          <TooltipBox
            x={padLeft + slot * hover + slot / 2}
            y={padTop}
            width={width}
            lines={[
              days[hover].date.slice(5),
              `${formatCompact(days[hover].low)}–${formatCompact(days[hover].high)}`,
              `${days[hover].sales} sales`,
            ]}
          />
        ) : null}
      </svg>
    </figure>
  );
}
