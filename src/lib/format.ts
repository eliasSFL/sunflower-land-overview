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
