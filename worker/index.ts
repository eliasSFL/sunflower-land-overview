/// <reference types="@cloudflare/workers-types" />

// Cloudflare Worker entrypoint — bundled by `npm run build:worker`
// (vite.worker.config.ts) and deployed by wrangler.
//
// Responsibilities:
//   1. Proxy GET /api/farms/{id} to api.sunflower-land.com using a
//      per-farm community key minted from the master HMAC secret
//      (SFL_COMMUNITY_API_KEY). The browser never sees or sends an
//      API key.
//   2. Expose /push/* routes that fan out to per-farm FarmPushDO
//      instances for Web Push subscription + test sends.
//
// Phase 2 will add: scheduled() handler for the cron-driven Coordinator
// sweep, GET /push/state for snapshot pulls, POST /push/refresh.

import { fetchAndCheckAccess } from "./access.ts";
import { sweep } from "./coordinator.ts";
import type { Env, SubscribeBody } from "./types.ts";

export { FarmPushDO } from "./farmPushDO.ts";

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function doStub(env: Env, farmId: number) {
  return env.FARM_PUSH_DO.get(env.FARM_PUSH_DO.idFromName(String(farmId)));
}

// Only real Web Push services. A stored endpoint we'll never be able
// to deliver to (or, worse, that points at attacker-controlled
// infrastructure) becomes permanent DO + D1 bloat — the prune path
// in push.ts only fires on 404/410 from the push service itself.
function isAllowedPushHost(host: string): boolean {
  return (
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com")
  );
}

async function handlePushSubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<SubscribeBody>(request);
  if (!body || typeof body.farmId !== "number") {
    return json({ error: "Missing farmId" }, { status: 400 });
  }
  const endpoint = body.subscription?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return json({ error: "Missing subscription.endpoint" }, { status: 400 });
  }
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return json({ error: "Malformed subscription.endpoint" }, { status: 400 });
  }
  // Require https + default port — push services don't accept http,
  // and connections to non-default ports on these hosts will fail with
  // an error that isn't 404/410, so the resulting bogus subscription
  // would never get pruned by push.ts and would sit in DO state until
  // TTL vacuum. Real browser-issued subscriptions always use the
  // default port.
  if (endpointUrl.protocol !== "https:") {
    return json({ error: "Endpoint must be https" }, { status: 400 });
  }
  if (endpointUrl.port !== "") {
    return json({ error: "Endpoint must use default port" }, { status: 400 });
  }
  if (!isAllowedPushHost(endpointUrl.hostname)) {
    return json({ error: "Endpoint host not allowed" }, { status: 400 });
  }
  // Cohort gate before any D1 / DO write. Other push endpoints
  // (`/refresh`, `/categories`, `/target`, `/test`) already require a
  // matching stored subscription, so they're transitively gated by
  // this — a denied farm can never get a subscription stored to begin
  // with.
  //
  // Both this access check and the DO's own warm-fetch hit the BE's
  // `community-get-farm` endpoint, which throttles per `cf-connecting-
  // ip`. Without forwarding, every Worker subscribe shares one egress
  // bucket on the BE and a small burst flips it into 429 → "Upstream
  // unavailable". Forwarding here scopes the bucket per-player.
  const clientIp = request.headers.get("cf-connecting-ip") ?? undefined;
  const access = await fetchAndCheckAccess(env, body.farmId, clientIp);
  if (!access.ok) {
    return json({ error: access.error }, { status: access.status });
  }
  // Forward the access-check body to the DO so it can apply the
  // snapshot directly and skip its own (otherwise redundant) upstream
  // fetch. The DO is only reachable through this entrypoint, so the
  // injected `__accessSnapshot` field can be trusted — a hand-crafted
  // client POST can't reach the DO without passing the access gate
  // above. The DO also re-checks `raw.id === body.farmId` as a belt.
  return doStub(env, body.farmId).fetch("https://do/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(clientIp ? { "x-client-ip": clientIp } : {}),
    },
    body: JSON.stringify({ ...body, __accessSnapshot: access.rawBody }),
  });
}

async function handlePushUnsubscribe(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<{ farmId?: number; endpoint?: string }>(request);
  if (!body || typeof body.farmId !== "number" || !body.endpoint) {
    return json({ error: "Missing farmId or endpoint" }, { status: 400 });
  }
  return doStub(env, body.farmId).fetch("https://do/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: body.endpoint }),
  });
}

async function handlePushCategories(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<{
    farmId?: number;
    endpoint?: string;
    mutedCategories?: string[];
  }>(request);
  if (
    !body ||
    typeof body.farmId !== "number" ||
    !body.endpoint ||
    !Array.isArray(body.mutedCategories)
  ) {
    return json(
      { error: "Missing farmId, endpoint, or mutedCategories" },
      { status: 400 },
    );
  }
  return doStub(env, body.farmId).fetch("https://do/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      farmId: body.farmId,
      endpoint: body.endpoint,
      mutedCategories: body.mutedCategories,
    }),
  });
}

async function handlePushTarget(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{
    farmId?: number;
    endpoint?: string;
    notificationTarget?: string;
  }>(request);
  if (
    !body ||
    typeof body.farmId !== "number" ||
    !body.endpoint ||
    (body.notificationTarget !== "overview" &&
      body.notificationTarget !== "play")
  ) {
    return json(
      { error: "Missing farmId, endpoint, or notificationTarget" },
      { status: 400 },
    );
  }
  return doStub(env, body.farmId).fetch("https://do/target", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      farmId: body.farmId,
      endpoint: body.endpoint,
      notificationTarget: body.notificationTarget,
    }),
  });
}

async function handlePushTest(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ farmId?: number; endpoint?: string }>(request);
  if (!body || typeof body.farmId !== "number" || !body.endpoint) {
    return json({ error: "Missing farmId or endpoint" }, { status: 400 });
  }
  return doStub(env, body.farmId).fetch("https://do/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: body.endpoint }),
  });
}

async function handlePushRefresh(
  request: Request,
  env: Env,
): Promise<Response> {
  const body = await readJson<{
    farmId?: number;
    endpoint?: string;
    snapshot?: string;
  }>(request);
  if (!body || typeof body.farmId !== "number" || !body.endpoint) {
    return json({ error: "Missing farmId or endpoint" }, { status: 400 });
  }
  // Forward the SPA's just-fetched body to the DO so it can apply
  // directly. The DO still verifies endpoint membership and matches
  // raw.id to its own farmId before trusting the payload.
  return doStub(env, body.farmId).fetch("https://do/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: body.endpoint,
      snapshot: body.snapshot,
    }),
  });
}

async function handlePushState(
  env: Env,
  farmId: number,
  since: number,
): Promise<Response> {
  const url = new URL("https://do/state");
  url.searchParams.set("since", String(since));
  return doStub(env, farmId).fetch(url.toString());
}

/**
 * GET `/api/farms/{id}` — proxy the SPA's farm load through the access
 * gate and stamp a server-trusted `__proxyFetchedAt` on the body so a
 * subsequent `/push/refresh` forward of the same body can't roll the DO
 * back to a stale snapshot. Eyeball's `cf-connecting-ip` flows through
 * to upstream as `x-forwarded-client-ip` so the BE's throttle can
 * scope per-player.
 */
async function handleProxyFarm(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  if (!/^\d+$/.test(id)) {
    return json({ error: "Invalid farm id" }, { status: 400 });
  }
  // Forward the player's IP so the BE can scope its `community-get-farm`
  // throttle per-player when SUPPORT_API_KEY matches. Without this, every
  // overview load shares one bucket on the worker's egress IP.
  const clientIp = request.headers.get("cf-connecting-ip") ?? undefined;
  const result = await fetchAndCheckAccess(env, Number(id), clientIp);
  if (!result.ok) {
    return json({ error: result.error }, { status: result.status });
  }
  // Stamp a server-trusted freshness marker on the proxy response.
  // The SPA forwards this body verbatim through /push/refresh; the
  // DO uses `__proxyFetchedAt` to reject any forwarded snapshot
  // that's older than the DO's current snapshot, closing a state-
  // rollback window (malicious subscriber replaying an old body, or
  // out-of-order delivery between devices). Unparsable JSON is
  // returned unstamped — the DO then falls through to its
  // upstream-fetch path.
  let stamped = result.rawBody;
  try {
    const parsed = JSON.parse(result.rawBody) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      parsed.__proxyFetchedAt = Date.now();
      stamped = JSON.stringify(parsed);
    }
  } catch {
    // Leave rawBody alone; downstream will fall through.
  }
  return new Response(stamped, {
    status: result.status,
    headers: {
      "content-type": result.contentType ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // Per-IP-per-route rate limit on every dynamic route. Static
    // assets (anything not under /push/* or /api/*) pass through
    // and are served by env.ASSETS at the end of this handler.
    // 60 req / 60s is far above legitimate user traffic but burns
    // out scripts immediately. The PWA's fetch helpers surface 429
    // through the regular `res.ok` branch, so no client changes are
    // needed.
    //
    // The key is bucketed by *route* not full pathname: paths that
    // embed a farm id (`/api/farms/{id}`, `/push/state/{id}`) would
    // otherwise grant each id its own 60/min budget per IP — which
    // for `/api/farms/{id}` amplifies into ~unlimited upstream
    // proxy traffic by rotating ids.
    if (url.pathname.startsWith("/push/") || url.pathname.startsWith("/api/")) {
      let routeKey: string;
      if (url.pathname.startsWith("/api/farms/")) routeKey = "/api/farms";
      else if (url.pathname.startsWith("/push/state/"))
        routeKey = "/push/state";
      else routeKey = url.pathname;

      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.PUSH_RATE_LIMITER.limit({
        key: `${ip}:${routeKey}`,
      });
      if (!success) {
        return new Response(JSON.stringify({ error: "Too many requests" }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "retry-after": "60",
          },
        });
      }
    }

    // Farm proxy.
    const farmMatch = /^\/api\/farms\/([^/]+)$/.exec(url.pathname);
    if (farmMatch && method === "GET") {
      return handleProxyFarm(request, env, farmMatch[1]);
    }

    // Push routes.
    if (url.pathname === "/push/vapid" && method === "GET") {
      if (!env.VAPID_PUBLIC)
        return json({ error: "Not configured" }, { status: 503 });
      return json({ publicKey: env.VAPID_PUBLIC });
    }
    if (url.pathname === "/push/subscribe" && method === "POST") {
      return handlePushSubscribe(request, env);
    }
    if (url.pathname === "/push/unsubscribe" && method === "POST") {
      return handlePushUnsubscribe(request, env);
    }
    if (url.pathname === "/push/categories" && method === "POST") {
      return handlePushCategories(request, env);
    }
    if (url.pathname === "/push/target" && method === "POST") {
      return handlePushTarget(request, env);
    }
    if (url.pathname === "/push/test" && method === "POST") {
      return handlePushTest(request, env);
    }
    if (url.pathname === "/push/refresh" && method === "POST") {
      return handlePushRefresh(request, env);
    }
    // Debug — manually fire the Coordinator sweep. Useful when the
    // cron-managed schedule appears to skip a tick. Idempotent: the
    // sweep just refetches each opted-in farm and re-applies its
    // snapshot to its DO. Output streams to `wrangler tail`.
    //
    // Gated by ADMIN_SECRET because each call fans out to every
    // opted-in farm — left unauthenticated it's a trivial cost-
    // amplification + upstream-DoS vector. Fails closed when the
    // secret is unset so a fresh deploy can't be exploited.
    if (url.pathname === "/push/sweep" && method === "POST") {
      if (
        !env.ADMIN_SECRET ||
        request.headers.get("x-admin-secret") !== env.ADMIN_SECRET
      ) {
        return json({ error: "Forbidden" }, { status: 403 });
      }
      ctx.waitUntil(
        sweep(env).catch((err) => {
          console.error(
            "manual sweep crashed:",
            err instanceof Error ? `${err.message}\n${err.stack}` : err,
          );
        }),
      );
      return json({ triggered: true });
    }
    const stateMatch = /^\/push\/state\/(\d+)$/.exec(url.pathname);
    if (stateMatch && method === "GET") {
      const since = Number(url.searchParams.get("since") ?? "0");
      return handlePushState(env, Number(stateMatch[1]), since);
    }

    return env.ASSETS.fetch(request);
  },

  // Cron-triggered Coordinator sweep. Every 10 min walks paginated
  // /community/farms, fan-outs to each opted-in DO.
  async scheduled(_event, env: Env, ctx): Promise<void> {
    ctx.waitUntil(
      sweep(env).catch((err) => {
        console.error(
          "coordinator: sweep crashed:",
          err instanceof Error ? `${err.message}\n${err.stack}` : err,
        );
      }),
    );
  },
} satisfies ExportedHandler<Env>;
