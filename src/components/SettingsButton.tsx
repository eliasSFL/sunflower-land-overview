import { CHROME_ICONS } from "../lib/assets.ts";

type Props = {
  onClick: () => void;
  // Mobile auto-hide hook: `false` slides the disc off-screen to the
  // right when the user stops scrolling. Desktop ignores this via the
  // `sm:translate-x-0` override — there's always plenty of room and
  // the buttons aren't in the way.
  visible?: boolean;
};

// Floating settings disc, bottom-right. Mirrors the main game's HUD
// gear button so the affordance is familiar.
export function SettingsButton({ onClick, visible = true }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open settings"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      title="Settings"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      className={`fixed right-4 z-40 cursor-pointer transition-transform duration-300 ease-out hover:scale-105 active:scale-95 sm:translate-x-0 sm:pointer-events-auto ${
        visible ? "translate-x-0" : "pointer-events-none translate-x-[150%]"
      }`}
    >
      <img
        src={CHROME_ICONS.settings_disc}
        alt=""
        className="h-12 w-12 sm:h-14 sm:w-14 drop-shadow"
        style={{ imageRendering: "pixelated" }}
      />
    </button>
  );
}
