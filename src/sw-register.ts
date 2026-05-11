// Registers the service worker on first window load. Bails silently in
// browsers without SW support (e.g. some embedded webviews) — the app
// keeps working without the offline shell + push features.

export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      // Don't spam the console in dev when the SW file changes mid-edit.
      if (import.meta.env.DEV) return;
      console.warn("[sw] registration failed", err);
    });
  });
}
