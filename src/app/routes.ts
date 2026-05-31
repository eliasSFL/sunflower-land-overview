import { CHROME_ICONS } from "../lib/assets.ts";

// Path constants for the three top-level routes. Kept in a leaf module
// (no React imports) so any consumer — App.tsx, the header, the
// page-nav FAB — can pull them in without setting up a circular
// dependency.
//
// `/timers` is the default route; `/` and any unknown path redirect
// here in App.tsx's <Routes> tree.
export const TIMERS_PATH = "/timers";
export const INFO_PATH = "/info";
export const DIGGING_PATH = "/digging";

// One page entry, consumed by the PageNavMenu FAB sheet. Each carries
// the icon shown next to its label in the slide-up menu. Keeping the
// array in one place means the order, labels, and icons can't drift.
export type PageTab = {
  to: string;
  label: string;
  icon: string;
};

export const TABS: PageTab[] = [
  { to: TIMERS_PATH, label: "Live Timers", icon: CHROME_ICONS.timer },
  { to: INFO_PATH, label: "Farm Info", icon: CHROME_ICONS.player },
  { to: DIGGING_PATH, label: "Digging", icon: CHROME_ICONS.sand },
];
