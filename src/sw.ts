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

// Allowed cross-origin click destinations. Internal URLs (same origin
// as the SW) bypass this list — they're treated as paths.
const ALLOWED_EXTERNAL_ORIGINS = new Set(["https://sunflower-land.com"]);

// Same-origin bounce page used to launch the destination PWA on
// external clicks. Chrome's clients.openWindow() opens cross-origin
// URLs in a plain browser tab even when the user has the target PWA
// installed; going through a same-origin redirect turns the next
// step into a standard top-level navigation, which IS routed through
// the browser's installed-PWA scope check.
const LAUNCH_PATH = "/launch.html";

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
        // window and let the OS / browser dedupe. The URL goes in the
        // fragment so the launch page is still a cache hit for
        // /launch.html (precache match ignores fragments but not
        // arbitrary query params).
        const launchUrl = `${LAUNCH_PATH}#to=${encodeURIComponent(target.url)}`;
        await self.clients.openWindow(launchUrl);
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
