import { CHROME_ICONS } from "../lib/assets.ts";

// Path constants for the top-level routes. Kept in a leaf module (no
// React imports) so any consumer — App.tsx, the header, the page-nav
// FAB — can pull them in without setting up a circular dependency.
//
// The dashboard is organised by what you're *doing* (the "action"
// scheme): grab what's ready (Now), watch what's cooking (Producing),
// clear what you owe (Quests), read the dig site (Digging), and check
// your identity / pets / shop (Farm).
//
// `/now` is the default route; `/` and any unknown path redirect here
// in App.tsx's <Routes> tree.
export const NOW_PATH = "/now";
export const PRODUCING_PATH = "/producing";
export const QUESTS_PATH = "/quests";
export const DIGGING_PATH = "/digging";
export const FARM_PATH = "/farm";

// Legacy paths from the old two-page split (Live Timers / Farm Info).
// App.tsx redirects them to their closest action-scheme home so old
// bookmarks and shared links don't 404.
export const LEGACY_TIMERS_PATH = "/timers";
export const LEGACY_INFO_PATH = "/info";

// One page entry, consumed by the PageNavMenu FAB sheet. Each carries
// the icon shown next to its label in the slide-up menu. Keeping the
// array in one place means the order, labels, and icons can't drift.
export type PageTab = {
  to: string;
  label: string;
  icon: string;
};

export const TABS: PageTab[] = [
  { to: NOW_PATH, label: "Now", icon: CHROME_ICONS.chest },
  { to: PRODUCING_PATH, label: "Producing", icon: CHROME_ICONS.timer },
  { to: QUESTS_PATH, label: "Quests", icon: CHROME_ICONS.scroll },
  { to: DIGGING_PATH, label: "Digging", icon: CHROME_ICONS.sand },
  { to: FARM_PATH, label: "Farm", icon: CHROME_ICONS.player },
];
