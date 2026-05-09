/// <reference types="@cloudflare/workers-types" />

// Cloudflare Worker entrypoint — bundled by @cloudflare/vite-plugin.
//
// Two responsibilities:
//   1. Proxy GET /api/farms/{id} to api.sunflower-land.com so the browser
//      never makes a cross-origin request and we don't need to be on the
//      SFL API's CORS allowlist.
//   2. Anything else falls through to the static-assets binding, which
//      serves the Vite build under /dist (with SPA fallback configured in
//      wrangler.jsonc).
//
// The user's API key flows through this Worker as a header — we don't log
// or persist it.

const UPSTREAM = "https://api.sunflower-land.com";

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    const match = /^\/api\/farms\/([^/]+)$/.exec(url.pathname);
    if (match && request.method === "GET") {
      const id = match[1];
      const apiKey = request.headers.get("x-api-key") ?? "";
      if (!apiKey) {
        return Response.json(
          { error: "Missing x-api-key header" },
          { status: 401 },
        );
      }

      const upstream = await fetch(
        `${UPSTREAM}/community/farms/${encodeURIComponent(id)}`,
        { headers: { "x-api-key": apiKey } },
      );

      return new Response(upstream.body, {
        status: upstream.status,
        headers: { "content-type": "application/json" },
      });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
