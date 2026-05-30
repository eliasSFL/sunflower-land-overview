// Short "X ago" label for refreshed/saved timestamps. Shared by the
// DashboardHeader meta block and the Settings "About & links" screen so
// both phrase elapsed time the same way. `now` is the ticking clock, so
// the label updates each render while the clock is live.
export function formatRefreshedAgo(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(at).toLocaleDateString();
}
