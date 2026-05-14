// Browser-side wrappers around the Push API. The VAPID public key is
// baked in at build time from VITE_VAPID_PUBLIC (see vite.config.ts).
//
// PushSubscription.toJSON() returns the shape we POST to the Worker —
// it's the same shape Workbox expects on push and what RFC 8291's
// aes128gcm encryption keys to via `keys.p256dh` + `keys.auth`.

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC as string;

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

export async function subscribePush(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC) {
    throw new Error("VITE_VAPID_PUBLIC is not set");
  }
  const reg = await getRegistration();
  if (!reg) return null;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    // Push API requires the BufferSource type; some lib.dom.d.ts
    // versions don't accept Uint8Array directly without the wrapper.
    applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC) as BufferSource,
  });
}

export async function unsubscribePush(): Promise<boolean> {
  const sub = await getExistingSubscription();
  if (!sub) return false;
  return sub.unsubscribe();
}
