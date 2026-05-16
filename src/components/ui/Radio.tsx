import classNames from "classnames";

import { pixelLightBorderStyle } from "./borderStyles.ts";

// Same 10×10 pixel-art box as Checkbox (matches PIXEL_SCALE = 2.625
// upstream). The "selected" indicator is a local pixel-art disc icon,
// rendered at the same w-8 size as the Checkbox's confirm tick — the
// dot vs tick is what tells radios apart from checkboxes visually.
const PIXEL_SCALE = 2.625;

type Props = {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
};

export function Radio({ checked, onChange, disabled = false }: Props) {
  const handleClick = () => {
    if (!disabled) onChange();
  };

  return (
    <div className="relative shrink-0" onClick={handleClick}>
      <div
        className={classNames("relative cursor-pointer", {
          "cursor-not-allowed opacity-75": disabled,
        })}
        style={{
          width: `${PIXEL_SCALE * 10}px`,
          height: `${PIXEL_SCALE * 10}px`,
          background: "#EAD4AA",
          ...pixelLightBorderStyle,
        }}
      />
      {checked && (
        <img
          src="/icons/radio_dot.svg"
          alt="selected"
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            width: `${PIXEL_SCALE * 5}px`,
            height: `${PIXEL_SCALE * 5}px`,
            transform: "translate(-50%, -50%)",
            imageRendering: "pixelated",
          }}
        />
      )}
    </div>
  );
}
