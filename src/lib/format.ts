export function formatRemaining(ms: number): string {
  if (ms <= 0) return "Ready";
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatYield(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  // Trim trailing zeros: 3.10 → "3.1", 3.00 → "3", 3.14159 → "3.14".
  const fixed = amount.toFixed(2);
  return fixed.replace(/\.?0+$/, "");
}

// Wall-clock time of a future `readyAt` in the viewer's locale. Adds a
// "tomorrow" / weekday hint when the time falls on a different calendar
// day from `now` so a "9:15 PM" tag doesn't look like it's coming up in
// 20 minutes when it's actually the next morning.
export function formatReadyAt(readyAt: number, now: number): string {
  const ready = new Date(readyAt);
  const ref = new Date(now);
  const time = ready.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  // Same calendar day → just the time.
  if (
    ready.getFullYear() === ref.getFullYear() &&
    ready.getMonth() === ref.getMonth() &&
    ready.getDate() === ref.getDate()
  ) {
    return time;
  }
  // Next calendar day → "tomorrow 9:15 AM".
  const oneDay = 24 * 60 * 60 * 1000;
  const tomorrow = new Date(ref.getTime() + oneDay);
  if (
    ready.getFullYear() === tomorrow.getFullYear() &&
    ready.getMonth() === tomorrow.getMonth() &&
    ready.getDate() === tomorrow.getDate()
  ) {
    return `tomorrow ${time}`;
  }
  // Further out → "Tue 9:15 AM" (short weekday).
  const weekday = ready.toLocaleDateString(undefined, { weekday: "short" });
  return `${weekday} ${time}`;
}

/**
 * Short form for a number that has to fit a fixed slot — a chart's axis
 * gutter or an endpoint label — where `formatYield` would overflow.
 *
 * Market volumes run to seven figures, and "1250000" at 8px is wider
 * than the 34px axis gutter the charts allow, so it would collide with
 * the plot. This caps any magnitude at four visible characters plus a
 * suffix: 1250000 → "1.3M", 12500 → "12.5k", 125 → "125".
 *
 * Deliberately NOT used in tables. There the full figure fits and
 * rounding a price to "1.3M" would hide the difference between two
 * listings, which is the whole reason someone is reading the column.
 */
export function formatCompact(amount: number): string {
  if (!Number.isFinite(amount)) return "0";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `${trimZeros((amount / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${trimZeros((amount / 1_000).toFixed(1))}k`;
  return formatYield(amount);
}

function trimZeros(fixed: string): string {
  return fixed.replace(/\.0$/, "");
}
