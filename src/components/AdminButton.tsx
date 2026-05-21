import { CHROME_ICONS } from "../lib/assets.ts";

// Floating launcher for the admin dashboard. Renders ONLY when
// useIsAdmin() resolves to "admin" — i.e. the current device holds a
// valid Cloudflare Access session. Anchored above the RefreshButton in
// the same right-edge stack (bottom-48 mobile / bottom-36 desktop).
export function AdminButton() {
  return (
    <a
      href="/admin"
      aria-label="Open admin dashboard"
      title="Admin"
      className="fixed bottom-48 right-4 z-40 cursor-pointer transition-transform hover:scale-105 active:scale-95 sm:bottom-36"
    >
      <div className="relative h-12 w-12 sm:h-14 sm:w-14">
        <img
          src={CHROME_ICONS.empty_disc_background}
          alt=""
          className="absolute inset-0 h-full w-full drop-shadow"
          style={{ imageRendering: "pixelated" }}
        />
        <img
          src={CHROME_ICONS.empty_disc}
          alt=""
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />
        <img
          src={CHROME_ICONS.player}
          alt=""
          aria-hidden
          className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    </a>
  );
}
