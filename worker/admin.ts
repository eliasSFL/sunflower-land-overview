// Cloudflare Access verification + admin route handlers.
//
// Trust model:
//   1. The `/admin/*` SPA route and `/api/admin/test-email` are protected
//      by a Cloudflare Access policy (Zero Trust dashboard). Cloudflare
//      blocks unauthenticated requests at the edge before they reach this
//      Worker.
//   2. Defense in depth: every admin handler also re-verifies the
//      `CF_Authorization` cookie (the JWT Access drops after login) and
//      checks the email against `env.ADMIN_EMAIL`. A misconfigured Access
//      policy can't accidentally expose admin actions.
//   3. `/api/admin/me` is intentionally NOT Access-gated — the SPA on
//      `/` polls it to decide whether to render the admin button. The
//      cookie is sent by the browser on every same-domain request, so
//      verifying it works on any path.

import {
  clearBanner,
  countOptedInFarms,
  getBanner,
  listSweepRuns,
  runAndRecordSweep,
  setBanner,
} from "./adminStorage.ts";
import { sweep } from "./coordinator.ts";
import { sendEmail } from "./email.ts";
import { listOptedInIds } from "./registry.ts";
import type { Env } from "./types.ts";

const ADMIN_PREFIX = "/api/admin/";
const DEV_EMAIL = "dev@localhost";

type AccessClaims = {
  email: string;
  exp: number;
  iss: string;
  aud: string | string[];
};

// `wrangler dev` serves on localhost; the production Worker lives behind
// Cloudflare on sfl-overview.com. Treat localhost requests as always-admin
// so the dashboard works without setting up Access locally. Safe because
// the hostname check can't be spoofed — production requests always come
// in with the real domain in `request.url`.
function isLocalDev(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1";
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

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return null;
}

function base64UrlDecode(s: string): ArrayBuffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function base64UrlDecodeJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(s))) as T;
}

// Validates the JWT against Cloudflare Access's JWKS endpoint. Returns the
// authenticated email when the signature, audience, issuer, and expiry all
// check out; null otherwise. Fails closed when team domain / audience env
// vars are unset so a fresh deploy without Access configured can't be
// exploited.
export async function verifyAccessJwt(
  request: Request,
  env: Env,
): Promise<string | null> {
  if (!env.CF_ACCESS_TEAM_DOMAIN || !env.CF_ACCESS_AUD) return null;

  // Prefer the header that Cloudflare injects on Access-gated routes;
  // fall back to the cookie for un-gated paths (e.g. /api/admin/me).
  const token =
    request.headers.get("cf-access-jwt-assertion") ||
    readCookie(request, "CF_Authorization");
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  let header: { kid?: string; alg?: string };
  let payload: AccessClaims;
  try {
    header = base64UrlDecodeJson(headerB64);
    payload = base64UrlDecodeJson(payloadB64);
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;

  const expectedIss = `https://${env.CF_ACCESS_TEAM_DOMAIN}`;
  if (payload.iss !== expectedIss) return null;

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(env.CF_ACCESS_AUD)) return null;

  // JWKS is small and Cloudflare returns it with cache headers; rely on
  // Workers' default cache rather than threading ctx in just to manage
  // an explicit caches.default round-trip.
  const certs = await fetch(`${expectedIss}/cdn-cgi/access/certs`, {
    cf: { cacheTtl: 3600, cacheEverything: true },
  });
  if (!certs.ok) return null;
  const { keys } = (await certs.json()) as {
    keys: Array<JsonWebKey & { kid: string }>;
  };
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`).buffer;
  const sig = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sig,
    data as ArrayBuffer,
  );
  if (!valid) return null;

  return typeof payload.email === "string" ? payload.email : null;
}

async function ensureAdmin(
  request: Request,
  env: Env,
): Promise<string | Response> {
  if (isLocalDev(request)) return DEV_EMAIL;
  if (!env.ADMIN_EMAIL) return json({ error: "Not configured" }, { status: 503 });
  const email = await verifyAccessJwt(request, env);
  if (!email) return json({ error: "Unauthorized" }, { status: 401 });
  if (email !== env.ADMIN_EMAIL) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  return email;
}

export function isAdminPath(pathname: string): boolean {
  return pathname.startsWith(ADMIN_PREFIX);
}

export async function handleAdmin(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
  method: string,
): Promise<Response> {
  // Public ping the SPA uses to decide whether to render the admin button.
  // Returns { admin: false } rather than 401 so the SPA fetch can branch
  // cleanly without treating "not admin" as an error.
  if (pathname === "/api/admin/me" && method === "GET") {
    if (isLocalDev(request)) return json({ admin: true, email: DEV_EMAIL });
    if (!env.ADMIN_EMAIL) return json({ admin: false });
    const email = await verifyAccessJwt(request, env);
    return json({
      admin: email === env.ADMIN_EMAIL,
      email: email === env.ADMIN_EMAIL ? email : undefined,
    });
  }

  if (pathname === "/api/admin/banner" && method === "GET") {
    const auth = await ensureAdmin(request, env);
    if (auth instanceof Response) return auth;
    const banner = await getBanner(env);
    return json({ banner });
  }

  if (pathname === "/api/admin/banner" && method === "POST") {
    const auth = await ensureAdmin(request, env);
    if (auth instanceof Response) return auth;
    const body = (await request.json().catch(() => null)) as {
      text?: unknown;
    } | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "Missing text" }, { status: 400 });
    // 500-char cap so a runaway banner can't blow up the top of every
    // user's screen. Adjust if a real use case needs more.
    if (text.length > 500) {
      return json({ error: "Banner too long (max 500)" }, { status: 400 });
    }
    await setBanner(env, text);
    const banner = await getBanner(env);
    return json({ banner });
  }

  if (pathname === "/api/admin/banner" && method === "DELETE") {
    const auth = await ensureAdmin(request, env);
    if (auth instanceof Response) return auth;
    await clearBanner(env);
    return json({ banner: null });
  }

  if (pathname === "/api/admin/sweep" && method === "POST") {
    const auth = await ensureAdmin(request, env);
    if (auth instanceof Response) return auth;
    // Run in the background so the UI gets an immediate ack; the
    // sweep_runs row is created synchronously inside runAndRecordSweep
    // before the wait, so the dashboard's recent-runs list reflects it
    // on the very next /api/admin/sweeps poll.
    ctx.waitUntil(
      runAndRecordSweep(env, "manual", sweep).catch((err) => {
        console.error(
          "manual sweep crashed:",
          err instanceof Error ? `${err.message}\n${err.stack}` : err,
        );
      }),
    );
    return json({ triggered: true });
  }

  if (pathname === "/api/admin/sweeps" && method === "GET") {
    const auth = await ensureAdmin(request, env);
    if (auth instanceof Response) return auth;
    const runs = await listSweepRuns(env, 20);
    return json({ runs });
  }

  if (pathname === "/api/admin/stats" && method === "GET") {
    const auth = await ensureAdmin(request, env);
    if (auth instanceof Response) return auth;
    const [optedIn, runs] = await Promise.all([
      countOptedInFarms(env),
      listSweepRuns(env, 1),
    ]);
    return json({
      optedInFarms: optedIn,
      lastSweep: runs[0] ?? null,
    });
  }

  const farmDebugMatch = /^\/api\/admin\/farm-debug\/(\d+)$/.exec(pathname);
  if (farmDebugMatch && method === "GET") {
    const auth = await ensureAdmin(request, env);
    if (auth instanceof Response) return auth;
    const farmId = farmDebugMatch[1];
    const stub = env.FARM_PUSH_DO.get(env.FARM_PUSH_DO.idFromName(farmId));
    const res = await stub.fetch("https://do/debug");
    if (!res.ok) {
      return json({ error: `DO returned ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return json({ farmId: Number(farmId), state: data });
  }

  if (pathname === "/api/admin/broadcast-push" && method === "POST") {
    const auth = await ensureAdmin(request, env);
    if (auth instanceof Response) return auth;
    const body = (await request.json().catch(() => null)) as {
      title?: unknown;
      body?: unknown;
      url?: unknown;
    } | null;
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const messageBody =
      typeof body?.body === "string" ? body.body.trim() : "";
    const urlField = typeof body?.url === "string" ? body.url.trim() : "";
    if (!title || !messageBody) {
      return json({ error: "Missing title / body" }, { status: 400 });
    }
    if (title.length > 100 || messageBody.length > 300) {
      return json(
        { error: "title ≤ 100, body ≤ 300 chars" },
        { status: 400 },
      );
    }
    const ids = await listOptedInIds(env);
    const tag = `sfl-overview:admin:${Date.now()}`;
    // Fan out concurrently with a small parallelism cap so we don't
    // saturate the DO RPC layer for a sudden 5k-farm broadcast.
    const PARALLEL = 25;
    let sent = 0;
    let pruned = 0;
    let total = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i += PARALLEL) {
      const slice = ids.slice(i, i + PARALLEL);
      const results = await Promise.allSettled(
        slice.map(async (id) => {
          const stub = env.FARM_PUSH_DO.get(env.FARM_PUSH_DO.idFromName(String(id)));
          const r = await stub.fetch("https://do/broadcast", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              title,
              body: messageBody,
              url: urlField || undefined,
              tag,
            }),
          });
          if (!r.ok) throw new Error(`DO(${id}) ${r.status}`);
          return (await r.json()) as {
            sent: number;
            pruned: number;
            total: number;
          };
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          sent += r.value.sent;
          pruned += r.value.pruned;
          total += r.value.total;
        } else {
          failed += 1;
          console.warn("broadcast fan-out failed:", r.reason);
        }
      }
    }
    return json({
      farms: ids.length,
      farmsFailed: failed,
      sent,
      pruned,
      total,
    });
  }

  if (pathname === "/api/admin/test-email" && method === "POST") {
    const auth = await ensureAdmin(request, env);
    if (auth instanceof Response) return auth;

    const parsed = (await request.json().catch(() => null)) as
      | { to?: unknown; subject?: unknown; text?: unknown }
      | null;
    const to = typeof parsed?.to === "string" ? parsed.to : null;
    const subject =
      typeof parsed?.subject === "string" ? parsed.subject : null;
    const text = typeof parsed?.text === "string" ? parsed.text : null;
    if (!to || !subject || !text) {
      return json({ error: "Missing to / subject / text" }, { status: 400 });
    }

    try {
      await sendEmail(env, { to, subject, text });
      return json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Send failed";
      return json({ error: message }, { status: 502 });
    }
  }

  return json({ error: "Not found" }, { status: 404 });
}
