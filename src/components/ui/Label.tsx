import type { CSSProperties, PropsWithChildren } from "react";
import classNames from "classnames";

import {
  pixelBlueBorderStyle,
  pixelGrayBorderStyle,
  pixelGreenBorderStyle,
  pixelOrangeBorderStyle,
  pixelRedBorderStyle,
} from "./borderStyles.ts";

export type LabelType = "default" | "success" | "info" | "danger" | "warning";

const LABEL_STYLES: Record<
  LabelType,
  { background: string; textColour: string; borderStyle: CSSProperties }
> = {
  default: {
    background: "#c0cbdc",
    borderStyle: pixelGrayBorderStyle,
    textColour: "#181425",
  },
  info: {
    background: "#1e6dd5",
    borderStyle: pixelBlueBorderStyle,
    textColour: "#ffffff",
  },
  success: {
    background: "#3e8948",
    borderStyle: pixelGreenBorderStyle,
    textColour: "#ffffff",
  },
  warning: {
    background: "#f09100",
    borderStyle: pixelOrangeBorderStyle,
    textColour: "#3e2731",
  },
  danger: {
    background: "#e43b44",
    borderStyle: pixelRedBorderStyle,
    textColour: "#ffffff",
  },
};

type Props = {
  className?: string;
  type?: LabelType;
  style?: CSSProperties;
  // Optional pixel-art icon rendered hanging off the left edge of the
  // label (mirrors the upstream Label `icon` prop). `iconWidth` is the
  // logical pixel width before scaling — defaults to 9 to match the
  // upstream default.
  icon?: string;
  iconWidth?: number;
};

// Pixel-scale multiplier matching upstream `PIXEL_SCALE = 2.625` (see
// sunflower-land/src/features/game/lib/constants.ts). Used to size the
// hanging icon so it visually matches Sunflower Land's labels.
const PIXEL_SCALE = 2.625;

export function Label({
  children,
  className,
  type = "default",
  style,
  icon,
  iconWidth = 9,
}: PropsWithChildren<Props>) {
  const palette = LABEL_STYLES[type];
  return (
    <div
      className={classNames(
        className,
        "w-fit justify-center flex items-center text-xs",
        { relative: !className?.includes("absolute") },
      )}
      style={{
        ...palette.borderStyle,
        background: palette.background,
        paddingLeft: icon ? "14px" : "3px",
        paddingRight: icon ? "4px" : "3px",
        color: palette.textColour,
        ...style,
      }}
    >
      {icon ? (
        <img
          src={icon}
          alt=""
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 object-contain"
          style={{
            // Match upstream SquareIcon: the icon renders at
            // PIXEL_SCALE * iconWidth so pixel-art sprites scale up
            // instead of shrinking into the label's text height.
            width: `${PIXEL_SCALE * iconWidth}px`,
            height: `${PIXEL_SCALE * iconWidth}px`,
            left: "-12px",
            imageRendering: "pixelated",
          }}
        />
      ) : null}
      {children}
    </div>
  );
}
