import type { FarmResponse } from "../api/fetchFarm.ts";
import { DonationAddress } from "../components/DonationAddress.tsx";
import { useVersionCheck } from "../hooks/useVersionCheck.ts";
import { BANNER_URLS } from "../lib/assets.ts";
import { hardReload } from "../lib/hardReload.ts";
import { formatRefreshedAgo } from "../lib/relativeTime.ts";

const GITHUB_REPO =
  (import.meta.env.VITE_GITHUB_REPO as string | undefined) ??
  "eliasSFL/sunflower-land-overview";

const DONATION_ADDRESS = (
  import.meta.env.VITE_DONATION_ADDRESS as string | undefined
)?.trim();

const BANNER_URL = BANNER_URLS.marketplace;

export function DashboardHeader({
  data,
  lastFetchedAt,
  now,
  subtitle,
}: {
  data: FarmResponse | undefined;
  lastFetchedAt: number | undefined;
  now: number;
  // Header subtitle is route-aware once a farm is loaded — see App.tsx
  // for the per-route copy. Passed in rather than read from
  // useLocation here to keep this component a dumb sink.
  subtitle: string;
}) {
  const { bundleSha, isStale } = useVersionCheck();
  // Falls back to the short SHA when no app version was injected at
  // build time (dev branch deploys, local builds) — see vite.config.ts.
  const versionLabel =
    (import.meta.env.VITE_APP_VERSION as string | undefined) ||
    bundleSha.slice(0, 7);
  // `/tree/<ref>` accepts tags, branches, and SHAs interchangeably, so
  // the link follows whatever the chip is showing.
  const versionUrl = versionLabel
    ? `https://github.com/${GITHUB_REPO}/tree/${versionLabel}`
    : `https://github.com/${GITHUB_REPO}`;

  // "Saved" reflects FarmModel.updatedAt from the BE — bumps only on
  // real saves (mongoDiff-non-empty). Distinguishes "we polled X ago"
  // (Refreshed) from "the farm last actually changed upstream X ago"
  // — useful when a second device is the one making changes. Bails on
  // missing / unparseable so legacy cached payloads from before the BE
  // shipped the field don't render "Saved NaN".
  const savedAt = (() => {
    const raw = data?.updatedAt;
    if (!raw) return undefined;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  })();

  return (
    // Banner header — repeating pixel-art grass tile, mirrors the
    // in-game Marketplace / Flower Dashboard chrome.
    <header
      className="relative mb-2 flex min-h-22 flex-col gap-1 rounded-sm py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0"
      style={{
        backgroundImage: `url(${BANNER_URL})`,
        backgroundRepeat: "repeat",
        backgroundSize: "320px",
        imageRendering: "pixelated",
      }}
    >
      <div className="z-10 min-w-0 flex flex-col pl-3 sm:pl-4">
        <p className="text-base text-white text-shadow">
          {(import.meta.env.VITE_APP_NAME as string | undefined) ??
            "Sunflower Land Overview"}
        </p>
        <p className="text-xs text-white text-shadow">{subtitle}</p>
      </div>

      {/* Build hash + last-refreshed time + stale-version nag.
          On mobile this stacks below the title (single column flow);
          on sm+ it sits in the top-right corner of the header.
          `shrink-0` prevents it from squeezing the title at sm+. Page
          switching no longer lives here — it moved to the PageNavMenu
          FAB (bottom-right HUD stack); see App.tsx. */}
      <div className="flex flex-row gap-2 items-center">
        <div className="z-10 flex shrink-0 flex-col items-start gap-1 pl-3 sm:items-end sm:pl-0 sm:pr-4 sm:text-right">
          {versionLabel ? (
            <span className="text-xs text-white text-shadow">
              <span>Version: </span>
              <a
                href={versionUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline decoration-dotted underline-offset-2 hover:opacity-80"
                title="View this release on GitHub"
              >
                {versionLabel}
              </a>
            </span>
          ) : null}
          {lastFetchedAt ? (
            <span
              className="whitespace-nowrap text-xs text-white text-shadow"
              title={new Date(lastFetchedAt).toLocaleString()}
            >
              <span>Refreshed </span>
              {formatRefreshedAgo(lastFetchedAt, now)}
            </span>
          ) : null}
          {savedAt !== undefined ? (
            <span
              className="whitespace-nowrap text-xs text-white text-shadow"
              title={new Date(savedAt).toLocaleString()}
            >
              <span>Saved </span>
              {formatRefreshedAgo(savedAt, now)}
            </span>
          ) : null}
          {DONATION_ADDRESS ? (
            <DonationAddress address={DONATION_ADDRESS} />
          ) : null}
          {isStale ? (
            <span
              role="button"
              tabIndex={0}
              onClick={hardReload}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  hardReload();
                }
              }}
              className="cursor-pointer whitespace-nowrap text-xs text-yellow-300 text-shadow underline decoration-dotted underline-offset-2 hover:opacity-80"
              title="A newer build is deployed — click to reload"
            >
              New version available · click to refresh
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
