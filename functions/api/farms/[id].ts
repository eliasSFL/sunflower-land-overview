/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Function — proxies GET /api/farms/{id} to the official
// Sunflower Land community API. The browser only talks to our own origin,
// which sidesteps CORS. The user's API key is forwarded as a header; we do
// not log or persist it.
//
// https://developers.cloudflare.com/pages/functions/

const UPSTREAM = "https://api.sunflower-land.com";

export const onRequestGet: PagesFunction<unknown, "id"> = async (context) => {
  const { id } = context.params;
  if (typeof id !== "string" || !id) {
    return new Response(JSON.stringify({ error: "Missing farm id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const apiKey = context.request.headers.get("x-api-key") ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing x-api-key header" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const upstream = await fetch(
    `${UPSTREAM}/community/farms/${encodeURIComponent(id)}`,
    { headers: { "x-api-key": apiKey } },
  );

  // Pass body and status through; force JSON content-type since that's all
  // this endpoint returns.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
};
