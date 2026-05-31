import type { TabPillsTab } from "../components/TabPills.tsx";

// Path constants for the two top-level routes. Kept in a leaf module
// (no React imports) so any consumer — App.tsx, the header, TabPills
// — can pull them in without setting up a circular dependency.
//
// `/timers` is the default route; `/` and any unknown path redirect
// here in App.tsx's <Routes> tree.
export const TIMERS_PATH = "/timers";
export const INFO_PATH = "/info";
export const DIGGING_PATH = "/digging";

// Tab definition consumed by every TabPills instance — both the
// desktop pills rendered in the header and the mobile pills rendered
// in the page content. Keeping the array in one place means the order
// and labels can't drift between the two surfaces.
export const TABS: TabPillsTab[] = [
  { to: TIMERS_PATH, label: "Live Timers" },
  { to: INFO_PATH, label: "Farm Info" },
  { to: DIGGING_PATH, label: "Digging" },
];
