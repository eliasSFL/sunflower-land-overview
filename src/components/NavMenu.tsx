import { useEffect, useState } from "react";

import { CHROME_ICONS } from "../lib/assets.ts";
import { pixelDarkBorderStyle } from "./ui/borderStyles.ts";
import { OuterPanel, InnerPanel } from "./ui/index.ts";

// Section-jump menu for mobile. A floating disc button at the
// bottom-right pops a bottom-sheet panel that slides up; tapping a
// section closes the sheet and scrolls the matching DOM node into
// view.
//
// Visibility: hidden on `sm+` (the multi-column desktop layout is
// already scannable). The disc stacks above the RefreshButton.
//
// Section list: callers pass the full candidate list. We filter at
// open time by DOM existence — a panel that returned null (off-season,
// empty list, no placed pets) doesn't have its id mounted, so its
// entry disappears from the sheet without duplicating each panel's
// render condition here. Adding a new panel only needs its id stamped
// + a push to the candidate list in the caller.

export type NavSection = {
  id: string;
  label: string;
  icon: string;
};

type Props = {
  sections: readonly NavSection[];
  // Mobile auto-hide hook (matches SettingsButton / RefreshButton).
  // When the sheet is open we force the FAB visible so re-closing
  // doesn't make it pop in from off-screen mid-interaction.
  visible?: boolean;
};

export function NavMenu({ sections, visible = true }: Props) {
  const [open, setOpen] = useState(false);
  // Snapshot of which sections were live the last time the sheet
  // opened. Set in the FAB click handler (not in an effect) so the
  // list doesn't pop empty as the sheet slides away on close.
  const [liveSections, setLiveSections] = useState<readonly NavSection[]>([]);

  const handleOpen = () => {
    setLiveSections(
      sections.filter((s) => document.getElementById(s.id) !== null),
    );
    setOpen(true);
  };

  // Close on Escape — matches the Modal component's affordance.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while the sheet is open so taps behind the
  // backdrop don't drag the underlying page.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (sections.length === 0) return null;

  const handleJump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setOpen(false);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* Floating disc — same composite as RefreshButton (filled disc +
          outline + centered glyph) so the three corner buttons read
          as a coherent stack. */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Open section menu"
        aria-expanded={open}
        aria-hidden={!visible && !open ? true : undefined}
        title="Jump to section"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 9rem)" }}
        className={`fixed right-4 z-40 cursor-pointer transition-transform duration-300 ease-out hover:scale-105 active:scale-95 sm:hidden ${
          visible || open
            ? "translate-x-0"
            : "pointer-events-none translate-x-[150%]"
        }`}
      >
        <div className="relative h-12 w-12">
          <img
            src={CHROME_ICONS.empty_disc_background}
            alt=""
            className="absolute inset-0 h-full w-full drop-shadow"
            style={{ imageRendering: "pixelated" }}
          />
          <img
            src={CHROME_ICONS.empty_disc}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{ imageRendering: "pixelated" }}
          />
          <img
            src={CHROME_ICONS.scroll}
            alt=""
            aria-hidden
            className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2"
            style={{ imageRendering: "pixelated" }}
          />
        </div>
      </button>

      {/* Backdrop — fades in/out. `pointer-events-none` when closed so
          it doesn't intercept taps on the page. */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 sm:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Bottom sheet — slides up via translate-y. Always mounted so
          the close animation can play; `pointer-events-none` when
          closed so the off-screen sheet doesn't capture stray taps. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Section navigation"
        className={`fixed inset-x-0 bottom-0 z-50 max-h-[80vh] transition-transform duration-300 ease-out sm:hidden ${
          open ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <OuterPanel>
          <InnerPanel className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">Jump to section</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
            {liveSections.length === 0 ? (
              <p className="py-2 text-sm opacity-70">
                No sections available right now.
              </p>
            ) : (
              <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
                {liveSections.map((section) => (
                  <li key={section.id}>
                    <button
                      type="button"
                      onClick={() => handleJump(section.id)}
                      className="flex w-full items-center gap-2 text-left text-sm"
                      style={{
                        ...pixelDarkBorderStyle,
                        background: "#c28569",
                        padding: "6px 8px",
                      }}
                    >
                      <img
                        src={section.icon}
                        alt=""
                        aria-hidden
                        className="h-5 w-5 shrink-0 object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                      <span>{section.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </InnerPanel>
        </OuterPanel>
      </div>
    </>
  );
}
