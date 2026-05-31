import type { CSSProperties } from "react";
import classNames from "classnames";
import { Link, useLocation } from "react-router-dom";

import { TABS, type PageTab } from "../app/routes.ts";
import {
  PRIMARY_BUTTON_URL,
  PRIMARY_BUTTON_PRESSED_URL,
} from "./ui/borderStyles.ts";

// Desktop page switcher — the horizontal pill bar from the redesign that
// sits under the header (Now · Producing · Quests · Digging · Farm).
// Desktop-only (`hidden sm:flex`); on mobile the same routes are reached
// through the PageNavMenu FAB instead, which is hidden at `sm+`.
//
// Visually a row of <Button>-styled pills (icon + label) where the
// active route renders permanently in the pressed state so it reads as
// selected — mirrors how the in-game HUD marks a selected tab. Built on
// <Link> so clicks are soft client-side navigations.

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
  color: "#674544",
};

function TabPill({ tab, active }: { tab: PageTab; active: boolean }) {
  return (
    <Link
      to={tab.to}
      aria-current={active ? "page" : undefined}
      className={classNames(
        "flex cursor-pointer items-center gap-2 px-3 py-1 text-sm leading-none no-underline transition-transform",
        // Border-image swap: pressed variant for active, normal for
        // inactive. `!` beats any class-level pressed:* rule added later,
        // mirroring ButtonPanel's border-image override.
        active
          ? "[border-image:var(--button-pressed-image)_3_3_4_3_fill]! translate-y-px"
          : "[border-image:var(--button-image)_3_3_4_3_fill]! hover:brightness-90 active:[border-image:var(--button-pressed-image)_3_3_4_3_fill]! active:scale-[0.99]",
      )}
      style={PILL_STYLE}
    >
      <img
        src={tab.icon}
        alt=""
        aria-hidden
        className="h-5 w-5 shrink-0 object-contain"
        style={{ imageRendering: "pixelated" }}
      />
      {/* `mb-1` nudge matches <Button> — centres the label against the
          chunky bottom border of the pixel chrome. */}
      <span className="mb-1">{tab.label}</span>
    </Link>
  );
}

export function TopTabBar() {
  const { pathname } = useLocation();

  // Longest-matching prefix wins so a future nested route still lights up
  // its parent pill; for today's flat routes it's an exact match.
  const active =
    TABS.filter(
      (t) => pathname === t.to || pathname.startsWith(`${t.to}/`),
    ).sort((a, b) => b.to.length - a.to.length)[0]?.to ?? TABS[0]?.to;

  return (
    <nav
      className="mb-2 hidden flex-wrap gap-2 sm:flex"
      aria-label="Dashboard pages"
    >
      {TABS.map((tab) => (
        <TabPill key={tab.to} tab={tab} active={active === tab.to} />
      ))}
    </nav>
  );
}
