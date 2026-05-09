export function formatRemaining(ms: number): string {
  if (ms <= 0) return "Ready";
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatAbsolute(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusFor(ms: number): "ready" | "soon" | "later" {
  if (ms <= 0) return "ready";
  if (ms <= 60 * 60 * 1000) return "soon";
  return "later";
}

/** Compact yield-amount formatter: integers stay as-is, fractions get up
 * to two decimals with trailing zeros trimmed (e.g. 3 → "3", 3.1 → "3.1",
 * 3.14 → "3.14", 3.145 → "3.15"). Used for the count prefix on item cards. */
export function formatYield(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return rounded.toString();
  // toFixed(2) keeps trailing zeros (3.1 → "3.10"); strip them so we render
  // "3.1" not "3.10". The leading "0." case is already covered by isInteger.
  return rounded.toFixed(2).replace(/0+$/, "");
}
