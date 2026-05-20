import webpush from "web-push";
import type { Env, PushPayload, StoredSubscription } from "./types.ts";

// Result for one subscription attempt. The DO uses `gone` to prune
// dead rows; `error` for backoff telemetry.
export type PushResult =
  | { ok: true; endpoint: string }
  | { ok: false; gone: true; endpoint: string; status: number }
  | {
      ok: false;
      gone: false;
      endpoint: string;
      status?: number;
      error: string;
    };

let configuredFor: { pub: string; priv: string; sub: string } | undefined;

function configure(env: Env): void {
  if (
    configuredFor &&
    configuredFor.pub === env.VAPID_PUBLIC &&
    configuredFor.priv === env.VAPID_PRIVATE &&
    configuredFor.sub === env.VAPID_SUBJECT
  ) {
    return;
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC,
    env.VAPID_PRIVATE,
  );
  configuredFor = {
    pub: env.VAPID_PUBLIC,
    priv: env.VAPID_PRIVATE,
    sub: env.VAPID_SUBJECT,
  };
}

export async function sendOne(
  env: Env,
  subscription: StoredSubscription,
  payload: PushPayload,
): Promise<PushResult> {
  configure(env);
  try {
    await webpush.sendNotification(
      subscription as unknown as webpush.PushSubscription,
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: "high" }, // 1 h — drop if device offline past then.
    );
    return { ok: true, endpoint: subscription.endpoint };
  } catch (err) {
    // web-push throws `WebPushError` with statusCode for HTTP errors.
    const status =
      typeof (err as { statusCode?: number }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : undefined;
    if (status === 404 || status === 410) {
      return { ok: false, gone: true, endpoint: subscription.endpoint, status };
    }
    return {
      ok: false,
      gone: false,
      endpoint: subscription.endpoint,
      status,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Cap on parallel web-push subrequests per chunk. Cloudflare Workers
// allows up to 1000 subrequests per invocation on paid plans, but in
// practice MAX_SUBSCRIPTIONS_PER_FARM (currently 10) limits per-farm
// fan-out far below that. Chunking is the right shape regardless —
// caps memory + concurrency on any future high-fanout call site.
const SEND_CHUNK = 25;

export async function sendAll(
  env: Env,
  subscriptions: StoredSubscription[],
  payload: PushPayload,
): Promise<PushResult[]> {
  const out: PushResult[] = [];
  for (let i = 0; i < subscriptions.length; i += SEND_CHUNK) {
    const chunk = subscriptions.slice(i, i + SEND_CHUNK);
    const settled = await Promise.allSettled(
      chunk.map((s) => sendOne(env, s, payload)),
    );
    for (let j = 0; j < settled.length; j++) {
      const r = settled[j];
      // sendOne never throws — WebPushError is caught and wrapped.
      // A rejection here would only fire on a programming bug; fall
      // back to a synthetic non-gone error so the index lines up with
      // the input array (callers use the order to attribute results
      // to subscriptions).
      out.push(
        r.status === "fulfilled"
          ? r.value
          : {
              ok: false,
              gone: false,
              endpoint: chunk[j].endpoint,
              error:
                r.reason instanceof Error ? r.reason.message : String(r.reason),
            },
      );
    }
  }
  return out;
}
