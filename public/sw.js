// Service worker for Sunflower Land Overview.
//
// Three responsibilities:
//   1. Cache the app shell so the page loads offline (network-first for
//      HTML so deploys are picked up, cache-first for hashed JS/CSS/img).
//   2. Receive Web Push messages from our Cloudflare Worker and render
//      them as system notifications.
//   3. Focus or open the app when the user clicks a notification.
//
// Bump SHELL_CACHE when the cache contract changes. Hashed assets carry
// their own cache key in the filename so they don't need versioning.

const SHELL_CACHE = "sfl-overview-shell-v3";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/sfl_overview-192.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache the farm API — it's per-user and time-sensitive.
  if (url.pathname.startsWith("/api/")) return;
  // Only handle same-origin (the CDN-loaded game assets have their own
  // caching headers and we don't want to interfere).
  if (url.origin !== self.location.origin) return;

  // HTML: network-first, fall back to cached shell.
  if (
    req.mode === "navigate" ||
    req.headers.get("accept")?.includes("text/html")
  ) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("/", copy));
          return resp;
        })
        .catch(() => caches.match("/").then((r) => r ?? Response.error())),
    );
    return;
  }

  // Hashed static assets: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp.ok && resp.type === "basic") {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
        }
        return resp;
      });
    }),
  );
});

// Push payload shape — kept in sync with worker/push.ts.
// { title: string, body: string, icon?: string, tag?: string, url?: string }
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Sunflower Land Overview", body: event.data?.text() ?? "" };
  }
  const title = data.title ?? "Sunflower Land Overview";
  const options = {
    body: data.body ?? "",
    icon: data.icon ?? "/icons/sfl_overview-192.webp",
    badge: "/icons/sfl_overview-badge-96.webp",
    tag: data.tag,
    data: { url: data.url ?? "/" },
    // Re-notify even when tag matches, so the user sees a fresh bump if
    // multiple plots of the same crop ripen in quick succession.
    renotify: !!data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if (w.url.endsWith(target) && "focus" in w) return w.focus();
        }
        return self.clients.openWindow(target);
      }),
  );
});
