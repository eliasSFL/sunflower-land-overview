import { useEffect, useState } from "react";

// Polls /version.json (emitted at build time, see vite.config.ts) and
// compares against the bundle's own VITE_COMMIT_SHA. When the deployed
// hash drifts past the running tab's hash we surface a refresh prompt.
//
// The endpoint is served with `Cache-Control: no-store` from both the
// Vite dev middleware and the Cloudflare static-assets binding, so a
// fresh fetch genuinely reflects what's deployed.

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

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

    const check = async () => {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { commit?: unknown };
        if (cancelled) return;
        if (typeof json.commit === "string" && json.commit.length > 0) {
          setDeployedSha(json.commit);
        }
      } catch {
        // Network blip / offline — leave the previous value alone.
      }
    };

    void check();
    const id = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  const isStale = !!bundleSha && !!deployedSha && deployedSha !== bundleSha;

  return { bundleSha, deployedSha, isStale };
}
