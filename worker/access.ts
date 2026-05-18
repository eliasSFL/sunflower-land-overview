import { mintFarmKey } from "./communityApi.ts";
import type { Env } from "./types.ts";

const UPSTREAM = "https://api.sunflower-land.com";

export type AccessFetchResult =
  | { ok: true; rawBody: string; status: number; contentType: string | null }
  | { ok: false; status: number; error: string };

/**
 * Fetch a farm from upstream and gate it against the overview's access
 * cohort. The same `hasOverviewAccess` predicate the SPA uses on
 * client-side is re-run here so a hand-crafted request can't reach the
 * D1 / DO write paths.
 *
 * Callers that also need the body (`/api/farms/{id}` proxy) read it off
 * `result.rawBody`; pure gate callers (`/push/subscribe`) ignore it.
 *
 * `clientIp` is forwarded to upstream on `x-forwarded-client-ip` so the
 * BE's `community-get-farm` throttle can scope per-player. The matching
 * `env.SUPPORT_API_KEY` is sent on `x-support-key` to unlock that path —
 * absent it, the BE falls back to `cf-connecting-ip` (no behaviour
 * change).
 */
export async function fetchAndCheckAccess(
  env: Env,
  farmId: number,
  clientIp?: string,
): Promise<AccessFetchResult> {
  if (!env.SFL_COMMUNITY_API_KEY) {
    return { ok: false, status: 503, error: "Server not configured" };
  }
  const key = await mintFarmKey(farmId, env.SFL_COMMUNITY_API_KEY);
  const headers: Record<string, string> = { "x-api-key": key };
  // Forward the eyeball's IP so the BE's `community-get-farm` throttle
  // can scope per-player instead of treating every subscribe as coming
  // from our shared Worker egress IP. See worker/communityApi.ts.
  if (clientIp) headers["x-forwarded-client-ip"] = clientIp;
  // Prove this fetch is from our trusted proxy so the BE actually
  // honours `x-forwarded-client-ip` for the throttle bucket. Without
  // the matching SUPPORT_API_KEY the BE falls back to cf-connecting-ip,
  // which is fine for dev — just leaves the throttle on the egress IP.
  if (env.SUPPORT_API_KEY) headers["x-support-key"] = env.SUPPORT_API_KEY;
  let upstream: Response;
  try {
    upstream = await fetch(
      `${UPSTREAM}/community/farms/${encodeURIComponent(String(farmId))}`,
      { headers },
    );
  } catch (err) {
    console.error("Upstream farm fetch failed", { farmId, err });
    return { ok: false, status: 502, error: "Bad Gateway" };
  }

  const rawBody = await upstream.text();
  const contentType = upstream.headers.get("content-type");

  if (!upstream.ok) {
    return {
      ok: false,
      status: upstream.status,
      error: rawBody || `Upstream ${upstream.status}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 502, error: "Malformed upstream response" };
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("farm" in parsed) ||
    typeof (parsed as Record<string, unknown>).farm !== "object"
  ) {
    return { ok: false, status: 502, error: "Unexpected upstream shape" };
  }

  return { ok: true, rawBody, status: upstream.status, contentType };
}
