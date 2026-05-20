import { useEffect, useState } from "react";

import { hardReload } from "../lib/hardReload.ts";

// Polls /version.json (emitted at build time, see vite.config.ts) and
// compares against the bundle's own VITE_COMMIT_SHA. When the deployed
// hash drifts past the running tab's hash we surface a refresh prompt.
//
// The endpoint is served with `Cache-Control: no-store` from both the
// Vite dev middleware and the Cloudflare static-assets binding, so a
// fresh fetch genuinely reflects what's deployed.
//
// Launch behaviour: if the very FIRST poll comes back stale, we treat
// this as "user just launched an old cached PWA" and auto-trigger a
// hard reload (clears SW + Cache API, then reloads). The sessionStorage
// flag prevents reload loops if /version.json is bad. Subsequent polls
// (mid-session deploys) only surface the nag — auto-reloading mid-use
// would be jarring.

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_RELOAD_SESSION_KEY = "sfl-overview:auto-reloaded";

type Result = {
  bundleSha: string;
  deployedSha: string | undefined;
  isStale: boolean;
};

export function useVersionCheck(
  intervalMs: number = DEFAULT_INTERVAL_MS,
): Result {
  const bundleSha =
    (import.meta.env.VITE_COMMIT_SHA as string | undefined) ?? "";
  const [deployedSha, setDeployedSha] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    let isFirstCheck = true;

    const check = async () => {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { commit?: unknown };
        if (cancelled) return;
        const deployed =
          typeof json.commit === "string" && json.commit.length > 0
            ? json.commit
            : undefined;
        if (deployed) setDeployedSha(deployed);

        // Auto-reload on launch only: first poll, real stale, and we
        // haven't already auto-reloaded this session. Without the
        // session flag a poisoned /version.json (or a CDN that
        // somehow serves a SHA we'll never match) would reload-loop.
        const wasFirst = isFirstCheck;
        isFirstCheck = false;
        if (
          wasFirst &&
          deployed &&
          bundleSha &&
          deployed !== bundleSha &&
          typeof sessionStorage !== "undefined" &&
          !sessionStorage.getItem(AUTO_RELOAD_SESSION_KEY)
        ) {
          sessionStorage.setItem(AUTO_RELOAD_SESSION_KEY, "1");
          void hardReload();
        }
      } catch {
        // Network blip / offline — leave the previous value alone.
        isFirstCheck = false;
      }
    };

    void check();
    const id = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs, bundleSha]);

  const isStale = !!bundleSha && !!deployedSha && deployedSha !== bundleSha;

  return { bundleSha, deployedSha, isStale };
}
