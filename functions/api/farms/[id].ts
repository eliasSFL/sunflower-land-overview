// Cloudflare Pages Function. Same-origin proxy to api.sunflower-land.com.
// The user's API key flows through the `x-api-key` request header — never
// logged or stored.

interface Params {
  id: string;
}

export const onRequestGet: PagesFunction<unknown, "id"> = async ({
  params,
  request,
}) => {
  const { id } = params as unknown as Params;
  if (!/^\d+$/.test(id)) {
    return new Response(JSON.stringify({ error: "Invalid farm id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing API key" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const upstream = await fetch(
    `https://api.sunflower-land.com/community/farms/${id}`,
    { headers: { "x-api-key": apiKey } },
  );

  // Strip any CORS/caching headers from upstream — we control them here.
  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  headers.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
};
