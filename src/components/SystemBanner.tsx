import { useEffect, useState } from "react";

// Polls /api/banner on mount and re-renders when the active banner text
// changes. Re-polls every 5 min so a banner set after the user already
// has the SPA open still shows up without forcing a hard refresh. The
// dismiss is local-only (sessionStorage keyed by banner text so a new
// banner re-shows even if the user dismissed an older one).
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const DISMISS_KEY = "sfl-overview:banner-dismissed";

type BannerState = { text: string; updatedAt: number } | null;

export function SystemBanner() {
  const [banner, setBanner] = useState<BannerState>(null);
  const [dismissed, setDismissed] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : sessionStorage.getItem(DISMISS_KEY),
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/banner", { credentials: "same-origin" });
        if (!res.ok) return;
        const body = (await res.json()) as { banner: BannerState };
        if (!cancelled) setBanner(body.banner);
      } catch {
        // network blip — try again on the next interval
      }
    }
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!banner) return null;
  if (dismissed === banner.text) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-30 bg-amber-200 px-3 py-2 text-sm text-[#3e2731] shadow flex items-start gap-2"
    >
      <span className="flex-1 whitespace-pre-wrap">{banner.text}</span>
      <button
        type="button"
        aria-label="Dismiss"
        className="px-2 leading-none cursor-pointer hover:opacity-70"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, banner.text);
          setDismissed(banner.text);
        }}
      >
        ×
      </button>
    </div>
  );
}
