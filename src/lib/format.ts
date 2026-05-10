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
