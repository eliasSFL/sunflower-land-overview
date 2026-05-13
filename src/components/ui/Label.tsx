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
};

export function Label({
  children,
  className,
  type = "default",
  style,
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
        paddingLeft: "3px",
        paddingRight: "3px",
        color: palette.textColour,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
