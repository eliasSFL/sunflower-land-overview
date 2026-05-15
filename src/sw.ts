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
  // Defense in depth: parse the push payload's url against our own
  // origin and keep only the pathname. Anything cross-origin or
  // unparseable falls back to "/".
  const raw = (event.notification.data as { url?: string } | null)?.url;
  let normalizedPath = "/";
  if (typeof raw === "string") {
    try {
      const u = new URL(raw, self.location.origin);
      if (u.origin === self.location.origin) {
        normalizedPath = u.pathname + u.search + u.hash;
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
