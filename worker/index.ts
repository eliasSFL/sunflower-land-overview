/// <reference types="@cloudflare/workers-types" />

// Cloudflare Worker entrypoint — bundled by wrangler.
//
// Three responsibilities:
//   1. Proxy GET /api/farms/{id} to api.sunflower-land.com so the browser
//      never makes a cross-origin request and we don't need to be on the
//      SFL API's CORS allowlist.
//   2. Serve the push pipeline under /api/push/* (subscribe, unsubscribe,
//      vapid-public). See `routes.ts`.
//   3. Anything else falls through to the static-assets binding, which
//      serves the Vite build under /dist (with SPA fallback configured in
//      wrangler.jsonc).
//
// `scheduled()` is invoked by the cron trigger in wrangler.jsonc and
// pushes notifications for ripe timers. See `scheduler.ts`.
//
// The user's API key flows through this Worker as a request header — we
// don't log or persist it.

import { handlePushRoute, type PushEnv } from "./routes.ts";
import { runScheduled } from "./scheduler.ts";

const UPSTREAM = "https://api.sunflower-land.com";

interface Env extends PushEnv {
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/push/")) {
      const resp = await handlePushRoute(request, env, url);
      if (resp) return resp;
    }

    const match = /^\/api\/farms\/([^/]+)$/.exec(url.pathname);
    if (match && request.method === "GET") {
      const id = match[1];
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
        // Network / DNS / TLS failure reaching the upstream API. Surface
        // a controlled JSON 502 so clients always get the same shape.
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

    return env.ASSETS.fetch(request);
  },

  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(runScheduled(env, Date.now()));
  },
} satisfies ExportedHandler<Env>;
