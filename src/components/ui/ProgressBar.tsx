import classNames from "classnames";

import { CHROME_ICONS } from "../../lib/assets.ts";

type Props = {
  // 0–100. Values outside the range are clamped so callers don't have
  // to guard against it themselves.
  pct: number;
  className?: string;
};

// Pixel-art progress bar matching the in-game HUD's XP bar:
//   - 5.25 / 5.25 / 5.25 / 7.875 CSS-px borders (upstream's
//     progressBarBorderStyle = 2/2/2/3 game px × PIXEL_SCALE 2.625),
//     painted with progress_bar_border.png via borderImageSlice.
//   - Dark teal (#193c3e) track + bright green (#63c74d) fill match
//     upstream PROGRESS_COLORS.progress.
// Pass any width / flex / margin utilities via `className` — the
// component owns the chrome only.
export function ProgressBar({ pct, className }: Props) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={classNames("relative h-4.5", className)}
      style={{
        borderStyle: "solid",
        borderImage: `url(${CHROME_ICONS.progress_bar_border}) 20% 20% 30%`,
        borderLeftWidth: "5.25px",
        borderRightWidth: "5.25px",
        borderTopWidth: "5.25px",
        borderBottomWidth: "7.875px",
        backgroundColor: "#193c3e",
        imageRendering: "pixelated",
      }}
    >
      <div
        className="h-full"
        style={{ width: `${width}%`, backgroundColor: "#63c74d" }}
        aria-hidden
      />
    </div>
  );
}
