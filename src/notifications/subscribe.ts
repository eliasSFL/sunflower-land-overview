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
  if (existing) return existing;
  const key = await fetchVapidPublicKey();
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(key) as BufferSource,
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
