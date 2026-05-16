import classNames from "classnames";

import { CHROME_ICONS } from "../../lib/assets.ts";
import { pixelLightBorderStyle } from "./borderStyles.ts";

// Mirrors PIXEL_SCALE = 2.625 (upstream features/game/lib/constants).
// Same 10×10 pixel-art box as sunflower-land/src/components/ui/Checkbox.tsx,
// just sourcing the confirm icon + border helpers from the overview repo.
const PIXEL_SCALE = 2.625;

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function Checkbox({ checked, onChange, disabled = false }: Props) {
  const handleClick = () => {
    if (!disabled) onChange(!checked);
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
          src={CHROME_ICONS.confirm}
          alt="checked"
          className="absolute left-1 bottom-1 w-8"
        />
      )}
    </div>
  );
}
