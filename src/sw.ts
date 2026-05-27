/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { createHandlerBoundToURL } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA fallback for navigation requests — same shape as the prior
// generateSW build. /api/*, /push/*, and /version.json bypass so live
// data, push management endpoints, and the version probe always hit
// the network.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/push\//, /^\/version\.json$/],
  }),
);

self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
  badge?: string;
};

// Web Push subscriptions can be invalidated outside the user's control
// — Chrome auto-revoke for low-engagement origins, push-service
// expiry, applicationServerKey rotation, and storage eviction all
// silently drop the sub. The browser fires `pushsubscriptionchange`
// so the SW can re-subscribe before the next push.
//
// `event.newSubscription` is sometimes pre-populated (the browser
// already re-subscribed for us); otherwise we subscribe explicitly
// with the current VAPID public key. Either way we relay to any open
// clients via postMessage so the SPA can POST /push/subscribe with the
// full prefs (farmId, mute set, target) that aren't reachable from the
// SW. If no clients are open the SPA's mount-effect repair will pick
// it up on next load via the lastRegisteredEndpoint mismatch.
self.addEventListener("pushsubscriptionchange", (event) => {
  const ev = event as ExtendableEvent & {
    oldSubscription?: PushSubscription | null;
    newSubscription?: PushSubscription | null;
  };
  ev.waitUntil(
    (async () => {
      let newSub: PushSubscription | null = ev.newSubscription ?? null;
      if (!newSub) {
        try {
          const res = await fetch("/push/vapid");
          if (!res.ok) return;
          const { publicKey } = (await res.json()) as { publicKey: string };
          newSub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(
              publicKey,
            ) as BufferSource,
          });
        } catch {
          // Best-effort: the SPA repair path will handle this on next
          // mount if the player still has permission granted.
          return;
        }
      }
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const c of windows) {
        c.postMessage({
          type: "pushsubscriptionchange",
          newEndpoint: newSub.endpoint,
          oldEndpoint: ev.oldSubscription?.endpoint ?? null,
        });
      }
    })(),
  );
});

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: payload.icon ?? "/icons/sfl_overview-192.webp",
      badge: payload.badge ?? "/icons/sfl_overview-badge-96.webp",
      data: { url: payload.url ?? "/" },
    }),
  );
});

// Allowed cross-origin click destinations. Internal URLs (same origin
// as the SW) bypass this list — they're treated as paths.
const ALLOWED_EXTERNAL_ORIGINS = new Set(["https://sunflower-land.com"]);

type ClickTarget =
  | { kind: "internal"; path: string }
  | { kind: "external"; url: string };

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | null)?.url;
  let target: ClickTarget = { kind: "internal", path: "/" };
  if (typeof raw === "string") {
    try {
      const u = new URL(raw, self.location.origin);
      if (u.origin === self.location.origin) {
        target = {
          kind: "internal",
          path: u.pathname + u.search + u.hash,
        };
      } else if (ALLOWED_EXTERNAL_ORIGINS.has(u.origin)) {
        target = { kind: "external", url: u.toString() };
      }
      // anything else: keep default "/"
    } catch {
      // unparseable url → keep default "/"
    }
  }
  event.waitUntil(
    (async () => {
      if (target.kind === "external") {
        // clients.matchAll is same-origin only, so we can't focus an
        // existing tab on the external origin — always open a new
        // window and let the OS / browser dedupe.
        await self.clients.openWindow(target.url);
        return;
      }
      const path = target.path;
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        const url = new URL(client.url);
        if (url.pathname === path || path === "/") {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(path);
    })(),
  );
});
