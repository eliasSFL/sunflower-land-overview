import { useEffect, type PropsWithChildren } from "react";

import { OuterPanel, InnerPanel } from "./Panel.tsx";
import { CHROME_ICONS } from "../../lib/assets.ts";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  // Matches the main game's Game Options modal width on desktop while
  // staying responsive on mobile.
  widthClassName?: string;
};

export function Modal({
  open,
  onClose,
  title,
  widthClassName = "w-full max-w-md",
  children,
}: PropsWithChildren<Props>) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the modal is open so taps behind the
  // backdrop don't scroll the underlying farm list.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[10vh] sm:pt-[15vh]"
      onClick={onClose}
    >
      <OuterPanel
        className={widthClassName}
        onClick={(e) => e.stopPropagation()}
      >
        <InnerPanel className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold">{title ?? ""}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 cursor-pointer p-1 hover:opacity-80"
            >
              <img
                src={CHROME_ICONS.close}
                alt=""
                className="h-5 w-5"
                style={{ imageRendering: "pixelated" }}
              />
            </button>
          </div>
          {children}
        </InnerPanel>
      </OuterPanel>
    </div>
  );
}
