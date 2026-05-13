import type { CSSProperties, MouseEvent, PropsWithChildren } from "react";
import classNames from "classnames";

import {
  PRIMARY_BUTTON_URL,
  PRIMARY_BUTTON_PRESSED_URL,
} from "./borderStyles.ts";

type Props = {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
};

const buttonVariables = {
  "--button-image": `url(${PRIMARY_BUTTON_URL})`,
  "--button-pressed-image": `url(${PRIMARY_BUTTON_PRESSED_URL})`,
} as CSSProperties;

export function Button({
  children,
  onClick,
  disabled,
  className,
  type,
}: PropsWithChildren<Props>) {
  return (
    <button
      className={classNames(
        "p-1 text-sm object-contain justify-center items-center hover:brightness-90 cursor-pointer flex disabled:opacity-50 [border-image:var(--button-image)_3_3_4_3_fill] active:[border-image:var(--button-pressed-image)_3_3_4_3_fill] transition-transform active:scale-[0.99]",
        !className?.match(/\bw-/g) && "w-full",
        className,
        { "cursor-not-allowed": disabled },
      )}
      type={type}
      disabled={disabled}
      style={{
        ...buttonVariables,
        borderStyle: "solid",
        borderWidth: "8px 8px 10px 8px",
        imageRendering: "pixelated",
        borderImageRepeat: "stretch",
        borderRadius: "13.125px",
      }}
      onClick={disabled ? undefined : onClick}
    >
      <div className="mb-1 w-full flex justify-center">{children}</div>
    </button>
  );
}
