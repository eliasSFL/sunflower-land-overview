import { CHROME_ICONS } from "../lib/assets.ts";

type Props = {
  onClick: () => void;
};

// Floating settings disc, bottom-right. Mirrors the main game's HUD
// gear button so the affordance is familiar.
export function SettingsButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open settings"
      title="Settings"
      className="fixed bottom-16 right-4 z-40 cursor-pointer transition-transform hover:scale-105 active:scale-95 sm:bottom-4"
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
