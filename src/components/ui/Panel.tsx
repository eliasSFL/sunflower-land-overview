import type { CSSProperties, HTMLAttributes, PropsWithChildren } from "react";
import classNames from "classnames";

import { pixelDarkBorderStyle, pixelLightBorderStyle } from "./borderStyles.ts";

const PADDING = "2.625px";

export function OuterPanel({
  children,
  className,
  style,
  ...divProps
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={classNames(className, "bg-[#c28569]")}
      style={{ ...pixelDarkBorderStyle, padding: PADDING, ...style }}
      {...divProps}
    >
      {children}
    </div>
  );
}

export function InnerPanel({
  children,
  className,
  style,
  ...divProps
}: PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & { style?: CSSProperties }
>) {
  return (
    <div
      className={className}
      style={{
        ...pixelLightBorderStyle,
        padding: PADDING,
        background: "#e4a672",
        ...style,
      }}
      {...divProps}
    >
      {children}
    </div>
  );
}
