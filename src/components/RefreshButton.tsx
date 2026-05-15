import { CHROME_ICONS } from "../lib/assets.ts";

type Props = {
  onClick: () => void;
  loading?: boolean;
  cooldownLeftMs?: number;
};

// Floating refresh disc, stacked above the SettingsButton. Mirrors the
// main game's HUD pattern (save floppy + gear). The cooldown is shown
// as a small numeric badge in the corner so the user knows when it'll
// next be available; clicks during cooldown are no-ops.
export function RefreshButton({ onClick, loading, cooldownLeftMs = 0 }: Props) {
  const cooling = cooldownLeftMs > 0;
  const disabled = loading || cooling;
  const seconds = Math.ceil(cooldownLeftMs / 1000);

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={
        loading
          ? "Refreshing"
          : cooling
            ? `Refresh available in ${seconds}s`
            : "Refresh"
      }
      title={
        loading ? "Refreshing…" : cooling ? `Refresh in ${seconds}s` : "Refresh"
      }
      className="fixed bottom-20 right-4 z-40 cursor-pointer transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
    >
      <div className="relative h-12 w-12 sm:h-14 sm:w-14">
        <img
          src={CHROME_ICONS.empty_disc}
          alt=""
          className="absolute inset-0 h-full w-full drop-shadow"
          style={{ imageRendering: "pixelated" }}
        />
        {/* Inline SVG refresh arrow centred on the disc. Pixel-style
            stroke-width and a small drop-shadow keep it consistent
            with the disc art without needing a bespoke asset. */}
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={
            "absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-[#3e2731] " +
            (loading ? "animate-spin" : "")
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <polyline points="21 4 21 10 15 10" />
        </svg>
        {cooling ? (
          <span
            className="absolute -bottom-1 -right-1 rounded-full bg-[#3e2731] px-1 text-[10px] font-semibold leading-4 text-white"
            aria-hidden
          >
            {seconds}
          </span>
        ) : null}
      </div>
    </button>
  );
}
