import type { CSSProperties } from "react";
import classNames from "classnames";
import { Link, useLocation } from "react-router-dom";

import {
  PRIMARY_BUTTON_URL,
  PRIMARY_BUTTON_PRESSED_URL,
} from "./ui/borderStyles.ts";

// Pixel-chrome pill tabs used in the DashboardHeader to switch between
// Live Timers (/timers) and Farm Info (/info). Visually a pair of
// <Button>-styled pills, but the "active" pill renders in the pressed
// state permanently (rather than only while clicked) so the current
// route reads as selected.
//
// Built on top of <Link> from react-router-dom — clicking either pill
// performs a soft client-side navigation. We match the active tab off
// useLocation().pathname rather than NavLink so we can keep the
// pressed-state styling inline alongside the rest of the chrome.

export type TabPillsTab = {
  to: string;
  label: string;
};

const buttonVariables = {
  "--button-image": `url(${PRIMARY_BUTTON_URL})`,
  "--button-pressed-image": `url(${PRIMARY_BUTTON_PRESSED_URL})`,
} as CSSProperties;

const PILL_STYLE: CSSProperties = {
  ...buttonVariables,
  borderStyle: "solid",
  borderWidth: "8px 8px 10px 8px",
  imageRendering: "pixelated",
  borderImageRepeat: "stretch",
  borderRadius: "13.125px",
};

function TabPill({ tab, active }: { tab: TabPillsTab; active: boolean }) {
  return (
    <Link
      to={tab.to}
      aria-current={active ? "page" : undefined}
      className={classNames(
        // Layout: pill is a flex row centring its label; min-width keeps
        // both pills the same width so the active one doesn't visibly
        // resize the row when switching.
        "flex min-w-24 cursor-pointer items-center justify-center px-2 py-1 text-sm leading-none no-underline transition-transform",
        // Border-image swap: pressed variant for active, normal for
        // inactive. The "!" prefix is needed because the inline `style`
        // below sets `borderImage` (via PILL_STYLE the cascade falls to
        // the class), but the class still needs !important to win over
        // any class-level pressed:* rules added later. Mirrors how
        // ButtonPanel handles its border-image override.
        active
          ? "[border-image:var(--button-pressed-image)_3_3_4_3_fill]! translate-y-px"
          : "[border-image:var(--button-image)_3_3_4_3_fill]! hover:brightness-90 active:[border-image:var(--button-pressed-image)_3_3_4_3_fill]! active:scale-[0.99]",
      )}
      style={{
        ...PILL_STYLE,
        color: "#674544",
      }}
    >
      {/* Same `mb-1` nudge <Button> applies — keeps the label visually
          centred against the chunky bottom border of the pixel chrome. */}
      <span className="mb-1">{tab.label}</span>
    </Link>
  );
}

export function TabPills({
  tabs,
  className,
}: {
  tabs: TabPillsTab[];
  className?: string;
}) {
  const { pathname } = useLocation();

  // Longest-matching prefix wins — covers the (current non-existent but
  // future) case of nested routes under /timers/* or /info/*. For our
  // two-route world it degenerates to an exact match.
  const active =
    tabs
      .filter((t) => pathname === t.to || pathname.startsWith(`${t.to}/`))
      .sort((a, b) => b.to.length - a.to.length)[0]?.to ?? tabs[0]?.to;

  return (
    <nav
      // Mobile: pills stretch full-width as a row below the title.
      // Desktop: pills are an inline group that sits in the header's
      // top-right cluster alongside the version/refresh meta.
      className={classNames("flex w-full gap-2 sm:w-auto", className)}
      aria-label="Dashboard sections"
    >
      {tabs.map((tab) => (
        <div
          key={tab.to}
          // Each pill takes equal share of the row width on mobile so
          // they read as a balanced segmented control; on desktop they
          // size to their content.
          className="flex-1 sm:flex-none"
        >
          <TabPill tab={tab} active={active === tab.to} />
        </div>
      ))}
    </nav>
  );
}
