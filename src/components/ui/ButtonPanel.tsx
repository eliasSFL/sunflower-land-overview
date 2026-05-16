import type { CSSProperties, HTMLAttributes, PropsWithChildren } from "react";
import classNames from "classnames";

import {
  PRIMARY_BUTTON_URL,
  PRIMARY_BUTTON_PRESSED_URL,
  pixelDarkBorderStyle,
} from "./borderStyles.ts";

// Container-shaped equivalent of <Button> — same light_button.png
// pixel chrome, but a <div> instead of <button> so callers can stack
// arbitrary content (icons, labels, a nested <Button>) inside it.
// Mirrors the submodule's ButtonPanel (sunflower-land/src/components/
// ui/Panel.tsx) — primary variant only here; secondary/card variants
// can land if a caller needs them.
type Props = HTMLAttributes<HTMLDivElement>;

const buttonVariables = {
  "--button-image": `url(${PRIMARY_BUTTON_URL})`,
  "--button-pressed-image": `url(${PRIMARY_BUTTON_PRESSED_URL})`,
} as CSSProperties;

export function ButtonPanel({
  children,
  className,
  style,
  ...divProps
}: PropsWithChildren<Props>) {
  return (
    <div
      className={classNames(
        // `!` prefix → !important. Needed because the spread
        // `pixelDarkBorderStyle` below sets `borderImage` as an inline
        // style; inline wins over a class rule unless the class is
        // !important. Without this the dark panel border paints over
        // the light button chrome — matches upstream's ButtonPanel.
        "[border-image:var(--button-image)_3_3_4_3_fill]! active:[border-image:var(--button-pressed-image)_3_3_4_3_fill]! transition-transform active:scale-[0.997] relative",
        className,
      )}
      style={{
        ...buttonVariables,
        ...pixelDarkBorderStyle,
        padding: "2.625px",
        borderStyle: "solid",
        borderWidth: "8px 8px 10px 8px",
        imageRendering: "pixelated",
        borderImageRepeat: "stretch",
        color: "#674544",
        ...style,
      }}
      {...divProps}
    >
      {children}
    </div>
  );
}
