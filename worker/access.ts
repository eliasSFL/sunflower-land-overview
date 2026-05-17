// Server-side enforcement of the overview's access cohort. Mirrors the
// client-side check in `src/api/fetchFarm.ts` so a hand-crafted request
// (bypassing the React UI) can't reach the D1 / DO write paths.
//
// `fetchAndCheckAccess` fetches the upstream farm payload and runs the
// same `hasOverviewAccess` predicate the SPA uses. Callers that already
// need the body (the `/api/farms/{id}` proxy) get the raw response back
// to avoid a second round-trip; pure gate callers (e.g. `/push/subscribe`)
// can ignore it.

import { hasOverviewAccess } from "../src/lib/access.ts";
import { makeGame } from "../src/game/index.ts";
import { mintFarmKey } from "./communityApi.ts";
import type { Env } from "./types.ts";

const UPSTREAM = "https://api.sunflower-land.com";

export type AccessFetchResult =
  | { ok: true; rawBody: string; status: number; contentType: string | null }
  | { ok: false; status: number; error: string };

export async function fetchAndCheckAccess(
  env: Env,
  farmId: number,
): Promise<AccessFetchResult> {
  if (!env.SFL_COMMUNITY_API_KEY) {
    return { ok: false, status: 503, error: "Server not configured" };
  }
  const key = await mintFarmKey(farmId, env.SFL_COMMUNITY_API_KEY);
  let upstream: Response;
  try {
    upstream = await fetch(
      `${UPSTREAM}/community/farms/${encodeURIComponent(String(farmId))}`,
      { headers: { "x-api-key": key } },
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

  const raw = parsed as { farm: unknown };
  const game = makeGame(raw.farm as Parameters<typeof makeGame>[0]);

  // `access_denied` is the sentinel the frontend's fetchFarm.ts maps
  // back to AccessDeniedError. Keep this exact string in sync.
  if (!hasOverviewAccess(game, "LIMITED_ONLY_ACCESS")) {
    return { ok: false, status: 403, error: "access_denied" };
  }

  return { ok: true, rawBody, status: upstream.status, contentType };
}
