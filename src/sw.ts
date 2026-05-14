/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { createHandlerBoundToURL } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA fallback for navigation requests — same shape as the phase-1
// generateSW build. /api/* and /version.json bypass so live data and
// the version probe always hit the network.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/version\.json$/],
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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Parse the push payload's url against our own origin and keep only
  // the pathname. Push payloads are aes128gcm-encrypted to the client's
  // subscription keys so an external attacker can't craft them, but
  // defense in depth: anything cross-origin or unparseable falls back
  // to "/".
  const raw = (event.notification.data as { url?: string } | null)?.url;
  let normalizedPath = "/";
  if (typeof raw === "string") {
    try {
      const u = new URL(raw, self.location.origin);
      if (u.origin === self.location.origin) {
        normalizedPath = u.pathname;
      }
    } catch {
      // unparseable url → keep default "/"
    }
  }
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        const url = new URL(client.url);
        if (url.pathname === normalizedPath || normalizedPath === "/") {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(normalizedPath);
    })(),
  );
});
