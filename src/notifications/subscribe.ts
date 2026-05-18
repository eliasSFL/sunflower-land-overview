// Browser-side wrappers around the Push API. The VAPID public key is
// fetched from the Worker at /push/vapid instead of being baked into
// the SPA bundle — that keeps key rotation a runtime concern.

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch("/push/vapid");
  if (!res.ok) {
    throw new Error(
      `Push not configured (vapid endpoint returned ${res.status})`,
    );
  }
  const { publicKey } = (await res.json()) as { publicKey: string };
  return publicKey;
}

export async function subscribePush(): Promise<PushSubscription | null> {
  const reg = await getRegistration();
  if (!reg) return null;
  const existing = await reg.pushManager.getSubscription();
  // Always fetch the current public key so we can detect server-side
  // rotation. If the fetch fails AND we already have a subscription,
  // return it as-is rather than tearing down a working sub on a
  // transient /push/vapid hiccup — worst case we keep using a stale-key
  // sub until a later call refreshes successfully.
  let serverKey: Uint8Array;
  try {
    serverKey = base64UrlToUint8Array(await fetchVapidPublicKey());
  } catch (err) {
    if (existing) return existing;
    throw err;
  }
  if (existing) {
    const existingKey = existing.options.applicationServerKey;
    if (existingKey && bytesEqual(new Uint8Array(existingKey), serverKey)) {
      return existing;
    }
    // VAPID public key has rotated server-side (or this subscription
    // predates applicationServerKey support entirely). The push service
    // will reject sends signed with the new private key against a sub
    // bound to the old public key — drop it so we can create a fresh
    // one. The caller will POST the new endpoint to /push/subscribe;
    // the old endpoint gets 410'd on its next fire and pruned by the
    // DO. pushManager.subscribe() with a different key would otherwise
    // throw InvalidStateError, so unsubscribe is mandatory here.
    //
    // Let a rejection propagate: NotificationSettings.onEnable wraps
    // this in try/catch and surfaces err.message to the UI, so the
    // original failure reason stays visible instead of being masked
    // by the downstream InvalidStateError from subscribe(). A `false`
    // resolve is benign per spec (sub was already invalid) — the next
    // subscribe() will succeed since nothing's blocking it.
    await existing.unsubscribe();
  }
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: serverKey as BufferSource,
  });
}

export async function unsubscribePush(): Promise<{
  endpoint: string;
  ok: boolean;
} | null> {
  const sub = await getExistingSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  const ok = await sub.unsubscribe();
  return { endpoint, ok };
}
