/// <reference types="@cloudflare/workers-types" />

// Cloudflare Worker entrypoint — bundled by `npm run build:worker`
// (vite.worker.config.ts), then deployed by wrangler.
//
// Three responsibilities:
//   1. Proxy GET /api/farms/{id} to api.sunflower-land.com so the
//      browser never makes a cross-origin request and we don't need
//      to be on the SFL API's CORS allowlist.
//   2. Manage push subscriptions for the PWA notification system.
//      POST/DELETE /api/push/subscribe and POST /api/push/test all
//      return 503 when the supporting bindings (PUSH_SUBS KV +
//      VAPID secrets + SFL_COMMUNITY_API_KEY) aren't configured, so
//      the rest of the Worker still deploys without push setup.
//   3. Run a cron tick (every minute) that fetches subscribed farms
//      via the community batch API, runs the existing timer
//      extractor, and fires Web Push for any timers that crossed
//      readyAt since the previous tick.
//
// The user's API key flows through this Worker as a request header
// for /api/farms/{id} only — we don't log or persist it. The push
// system uses a shared community API key (env.SFL_COMMUNITY_API_KEY)
// for server-side fetches and never sees per-user keys.

import { hasPushBindings, runScheduledTick, type Env as PushEnv } from "./scheduler.ts";
import { deleteSub, getSub, putSub } from "./subscriptions.ts";
import { sendPush } from "./push.ts";

const UPSTREAM = "https://api.sunflower-land.com";

interface Env extends PushEnv {
  ASSETS: Fetcher;
}

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

async function handleSubscribePost(request: Request, env: Env): Promise<Response> {
  type Body = {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    farmId: number;
    categories: Record<string, boolean>;
  };
  const body = await readJson<Body>(request);
  if (
    !body ||
    !body.subscription?.endpoint ||
    !body.subscription.keys?.p256dh ||
    !body.subscription.keys.auth ||
    typeof body.farmId !== "number" ||
    !body.categories
  ) {
    return json({ error: "Invalid body" }, { status: 400 });
  }
  // Preserve lastTickAt if the same subscription re-subscribes (eg.
  // user toggling categories) so we don't replay ripe timers from the
  // previous window.
  const existing = await getSub(env.PUSH_SUBS!, body.subscription.endpoint);
  const now = Date.now();
  await putSub(env.PUSH_SUBS!, {
    endpoint: body.subscription.endpoint,
    keys: body.subscription.keys,
    farmId: body.farmId,
    categories: body.categories,
    lastTickAt: existing?.lastTickAt ?? now,
    createdAt: existing?.createdAt ?? now,
  });
  return json({ ok: true }, { status: 201 });
}

async function handleSubscribeDelete(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ endpoint?: string }>(request);
  if (!body?.endpoint) return json({ error: "Missing endpoint" }, { status: 400 });
  await deleteSub(env.PUSH_SUBS!, body.endpoint);
  return json({ ok: true });
}

async function handleTestPush(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ endpoint?: string }>(request);
  if (!body?.endpoint) return json({ error: "Missing endpoint" }, { status: 400 });
  const sub = await getSub(env.PUSH_SUBS!, body.endpoint);
  if (!sub) return json({ error: "Subscription not found" }, { status: 404 });
  const res = await sendPush(
    { endpoint: sub.endpoint, keys: sub.keys },
    {
      title: "SFL Overview",
      body: "Notifications are working",
      tag: "test",
      url: "/",
    },
    {
      publicKey: env.VAPID_PUBLIC!,
      privateKey: env.VAPID_PRIVATE!,
      subject: env.VAPID_SUBJECT!,
    },
  );
  if (res.status === 404 || res.status === 410) {
    await deleteSub(env.PUSH_SUBS!, sub.endpoint);
  }
  return json({ ok: res.ok, status: res.status });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // 1. /api/farms/{id} — per-user farm proxy (phase 1 behavior).
    const farmMatch = /^\/api\/farms\/([^/]+)$/.exec(url.pathname);
    if (farmMatch && request.method === "GET") {
      const id = farmMatch[1];
      if (!/^\d+$/.test(id)) {
        return Response.json({ error: "Invalid farm id" }, { status: 400 });
      }
      const apiKey = request.headers.get("x-api-key") ?? "";
      if (!apiKey) {
        return Response.json(
          { error: "Missing x-api-key header" },
          { status: 401 },
        );
      }
      let upstream: Response;
      try {
        upstream = await fetch(
          `${UPSTREAM}/community/farms/${encodeURIComponent(id)}`,
          { headers: { "x-api-key": apiKey } },
        );
      } catch (err) {
        return Response.json(
          {
            error: "Bad Gateway",
            message: err instanceof Error ? err.message : String(err),
          },
          { status: 502, headers: { "cache-control": "no-store" } },
        );
      }
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type":
            upstream.headers.get("content-type") ?? "application/json",
          "cache-control": "no-store",
        },
      });
    }

    // 2. /api/push/* — push subscription management.
    if (url.pathname === "/api/push/subscribe") {
      if (!hasPushBindings(env)) return json({ error: "Push not configured" }, { status: 503 });
      if (request.method === "POST") return handleSubscribePost(request, env);
      if (request.method === "DELETE") return handleSubscribeDelete(request, env);
      return json({ error: "Method not allowed" }, { status: 405 });
    }
    if (url.pathname === "/api/push/test" && request.method === "POST") {
      if (!hasPushBindings(env)) return json({ error: "Push not configured" }, { status: 503 });
      return handleTestPush(request, env);
    }

    // 3. Fall through to static assets (SPA + manifest + SW + icons).
    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(runScheduledTick(env));
  },
} satisfies ExportedHandler<Env>;
