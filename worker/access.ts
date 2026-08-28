import { serviceKey, upstreamBase } from "./communityApi.ts";
import type { Env } from "./types.ts";

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
  // One service key for every farm we read — see `serviceKey`. The
  // `farmId` argument no longer influences the credential at all.
  const key = serviceKey(env);
  if (!key) {
    return { ok: false, status: 503, error: "Server not configured" };
  }
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
      `${upstreamBase(env)}/community/farms/${encodeURIComponent(String(farmId))}`,
      { headers },
    );
  } catch (err) {
    console.error("Upstream farm fetch failed", { farmId, err });
    return { ok: false, status: 502, error: "Bad Gateway" };
  }

  const rawBody = await upstream.text();
  const contentType = upstream.headers.get("content-type");

  // One log line per upstream community/farms call so the CF dashboard
  // can answer two questions at a glance:
  //   1. Is SUPPORT_API_KEY actually loaded on this deploy?
  //      (`hasSupportKey: false` → secret missing, BE will throttle on
  //      cf-connecting-ip instead of player IP)
  //   2. What status did upstream return?
  //      (a sudden 401 here would mean our service key stopped
  //      qualifying; a surge of 429 confirms the BE throttle is biting.)
  // Body / key values are deliberately omitted.
  console.log("community/farms upstream", {
    farmId,
    hasSupportKey: !!env.SUPPORT_API_KEY,
    hasClientIp: !!clientIp,
    status: upstream.status,
  });

  // A 401 is never about the farm being asked for — upstream only ever
  // sees our one service key, so this means the key is revoked or its
  // owning farm dropped below VIP + level 50. Surfacing upstream's 401
  // verbatim would read to the SPA as "you aren't allowed to view this
  // farm"; it's our outage, so report it as one and shout in the logs.
  if (upstream.status === 401) {
    console.error(
      "community key rejected by upstream (401) — every farm fetch will fail " +
        "until it is renewed at https://sunflower-land.com/community-docs",
    );
    return {
      ok: false,
      status: 503,
      error: "Overview API key is not currently valid",
    };
  }

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
