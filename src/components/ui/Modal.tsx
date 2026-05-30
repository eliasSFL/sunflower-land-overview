import { useEffect, type PropsWithChildren } from "react";

import { OuterPanel, InnerPanel } from "./Panel.tsx";
import { CHROME_ICONS } from "../../lib/assets.ts";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  // When set, a back chevron renders to the left of the title and calls
  // this instead of closing. Used by the drill-down SettingsModal so a
  // sub-screen header reads "‹ Notifications  ✕" — back returns to the
  // home list, close dismisses the whole modal.
  onBack?: () => void;
  // Matches the main game's Game Options modal width on desktop while
  // staying responsive on mobile.
  widthClassName?: string;
};

export function Modal({
  open,
  onClose,
  title,
  onBack,
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
          <div className="flex items-center justify-between gap-2">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="-ml-1 flex min-w-0 cursor-pointer items-center gap-2 p-1 hover:opacity-80"
              >
                <img
                  src={CHROME_ICONS.chevron_right}
                  alt=""
                  className="h-[18px] w-[18px] rotate-180"
                  style={{ imageRendering: "pixelated" }}
                />
                <span className="truncate text-base font-semibold">
                  {title ?? ""}
                </span>
              </button>
            ) : (
              <span className="truncate text-base font-semibold">
                {title ?? ""}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 shrink-0 cursor-pointer p-1 hover:opacity-80"
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
