// True "give me the latest build" reload.
//
// A naive `location.reload()` (or cache-busting the URL) doesn't help
// when our service worker is in front of every navigation — `src/sw.ts`
// registers a NavigationRoute bound to the precached `/index.html`, so
// the SW serves the OLD precache regardless of what the URL says.
//
// To actually pick up the deployed build we have to:
//   1. Unregister every active SW registration for this origin.
//   2. Purge every Cache API entry (workbox precache + runtime cache).
//   3. Reload — now the network serves the real index.html, and
//      vite-plugin-pwa's autoUpdate flow re-installs the SW from the
//      latest precache manifest on next boot.
//
// All steps are best-effort: a denied permission or quota error should
// still result in *a* reload rather than a no-op the user can't escape.
export async function hardReload(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore — fall through to cache purge + reload
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore — fall through to reload
  }
  // Cache-bust the URL anyway so any intermediate HTTP cache (CDN edge
  // shared cache, browser memory cache for this tab) can't reuse a
  // stored response under the original URL key.
  const url = new URL(window.location.href);
  url.searchParams.set("_", String(Date.now()));
  window.location.replace(url.toString());
}
