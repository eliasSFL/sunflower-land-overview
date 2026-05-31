import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { TABS } from "../app/routes.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { Button, OuterPanel, InnerPanel } from "./ui/index.ts";

// Page-navigation FAB. A floating disc (bottom-right, stacked in the
// HUD column with Settings/Refresh) that pops a slide-up sheet listing
// the site's top-level pages — Live Timers, Farm Info, Digging.
//
// Deliberately mirrors NavMenu's "Jump to section" affordance (same
// disc chrome + slide-up sheet) so the two read as one family. The
// differences: this switches react-router routes instead of scrolling
// to a section, and it shows on desktop too (the page switcher used to
// live as header pills — this replaces them on every breakpoint).
//
// The current route renders in the pressed state so it reads as
// selected, matching how the old TabPills marked the active tab.

type Props = {
  // Mobile auto-hide hook (matches Settings/Refresh/NavMenu). Forced
  // visible while the sheet is open so re-closing doesn't pop the FAB
  // in from off-screen mid-interaction. Desktop ignores it via the
  // `sm:translate-x-0` override.
  visible?: boolean;
};

export function PageNavMenu({ visible = true }: Props) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();

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

  // Longest-matching prefix wins (mirrors the old TabPills) so a future
  // nested route under a page still lights up its entry; for today's
  // flat routes it degenerates to an exact match.
  const activeTo =
    TABS.filter(
      (t) => pathname === t.to || pathname.startsWith(`${t.to}/`),
    ).sort((a, b) => b.to.length - a.to.length)[0]?.to ?? TABS[0]?.to;

  const handleGo = (to: string) => {
    setOpen(false);
    if (to !== pathname) navigate(to);
  };

  return (
    <>
      {/* Floating disc — same composite as RefreshButton/NavMenu (filled
          disc + outline + centered glyph) so the corner buttons read as
          a coherent stack. Unlike NavMenu this is NOT `sm:hidden`: the
          page switcher lives here on desktop too, so it follows the
          Settings/Refresh desktop-always-visible pattern. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open page menu"
        aria-expanded={open}
        aria-hidden={!(visible || open) ? true : undefined}
        tabIndex={visible || open ? 0 : -1}
        title="Go to page"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 9rem)" }}
        className={`fixed right-4 z-40 cursor-pointer transition-transform duration-300 ease-out hover:scale-105 active:scale-95 sm:translate-x-0 sm:pointer-events-auto ${
          visible || open
            ? "translate-x-0"
            : "pointer-events-none translate-x-[150%]"
        }`}
      >
        <div className="relative h-12 w-12 sm:h-14 sm:w-14">
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
            src={CHROME_ICONS.map}
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
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Slide-up sheet. Full-width on mobile; on desktop `mx-auto` +
          `sm:max-w-md` centre it as a compact card (a full-bleed bar
          would be far too wide for three links). Always mounted so the
          close animation can play. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Page navigation"
        aria-hidden={!open}
        inert={!open}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[80vh] transition-transform duration-300 ease-out sm:max-w-md ${
          open ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <OuterPanel>
          <InnerPanel className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">Go to page</span>
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
            <ul className="flex flex-col gap-1">
              {TABS.map((tab) => {
                const active = tab.to === activeTo;
                return (
                  <li key={tab.to}>
                    {/* Active page is pinned to the pressed border-image
                        (the `!` beats Button's base border-image class)
                        so it reads as selected, exactly like TabPills. */}
                    <Button
                      onClick={() => handleGo(tab.to)}
                      className={
                        active
                          ? "[border-image:var(--button-pressed-image)_3_3_4_3_fill]! translate-y-px"
                          : undefined
                      }
                    >
                      <span
                        className="flex items-center gap-2"
                        aria-current={active ? "page" : undefined}
                      >
                        <img
                          src={tab.icon}
                          alt=""
                          aria-hidden
                          className="h-5 w-5 shrink-0 object-contain"
                          style={{ imageRendering: "pixelated" }}
                        />
                        <span>{tab.label}</span>
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </InnerPanel>
        </OuterPanel>
      </div>
    </>
  );
}
