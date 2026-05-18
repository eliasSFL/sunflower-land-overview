import { useEffect, useRef, useState } from "react";

import { CHROME_ICONS } from "../lib/assets.ts";

type Props = {
  onClick: () => void;
  loading?: boolean;
  cooldownLeftMs?: number;
};

// Three-state icon timing — matches the 2 s confirm flash in
// sunflower-land/src/features/island/hud/components/Save.tsx.
const SUCCESS_FLASH_MS = 2000;

// Floating refresh disc, stacked above the SettingsButton. Mirrors
// the main game's save-button affordance (Save.tsx in the submodule):
//   * idle / cooldown → fast_forward arrows
//   * refreshing      → animated timer.gif spinner
//   * just succeeded  → confirm checkmark (2 s flash, then back to idle)
// The cooldown is shown as a small numeric badge in the corner so the
// user knows when it'll next be available; clicks during cooldown are
// no-ops.
export function RefreshButton({ onClick, loading, cooldownLeftMs = 0 }: Props) {
  const cooling = cooldownLeftMs > 0;
  const disabled = loading || cooling;
  const seconds = Math.ceil(cooldownLeftMs / 1000);

  const [justSucceeded, setJustSucceeded] = useState(false);
  const prevLoadingRef = useRef(false);

  useEffect(() => {
    // Detect loading true → false transition. On that edge, flash
    // the confirm icon for `SUCCESS_FLASH_MS` and then revert.
    if (prevLoadingRef.current && !loading) {
      setJustSucceeded(true);
      const t = setTimeout(() => setJustSucceeded(false), SUCCESS_FLASH_MS);
      prevLoadingRef.current = !!loading;
      return () => clearTimeout(t);
    }
    prevLoadingRef.current = !!loading;
  }, [loading]);

  const iconSrc = loading
    ? CHROME_ICONS.timer
    : justSucceeded
      ? CHROME_ICONS.confirm
      : CHROME_ICONS.fast_forward;

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
      className="fixed bottom-32 right-4 z-40 cursor-pointer transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 sm:bottom-20"
    >
      <div className="relative h-12 w-12 sm:h-14 sm:w-14">
        {/* Disc = filled background + outline. settings_disc.png is a
            single sprite that already has both; empty_disc.png is just
            the outline, so we composite the matching background under
            it. */}
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
          src={iconSrc}
          alt=""
          aria-hidden
          className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2"
          style={{ imageRendering: "pixelated" }}
        />
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
