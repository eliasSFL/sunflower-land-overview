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
      { TTL: 60 * 60 }, // 1 h — drop if device offline past then.
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

export async function sendAll(
  env: Env,
  subscriptions: StoredSubscription[],
  payload: PushPayload,
): Promise<PushResult[]> {
  return Promise.all(subscriptions.map((s) => sendOne(env, s, payload)));
}
