import { useState, type ReactNode } from "react";

import { Button, ButtonPanel, Label, Modal } from "./ui/index.ts";
import { ActiveFarmPanel } from "./ActiveFarmPanel.tsx";
import { FarmIdForm } from "./FarmIdForm.tsx";
import { LayoutPanelGrid } from "./LayoutPanelGrid.tsx";
import { getCategoryIcon } from "./categoryIcon.ts";
import { NotificationSettings } from "./NotificationSettings.tsx";
import type { FarmResponse } from "../api/fetchFarm.ts";
import type { PanelSheet } from "../hooks/usePanelArrangement.ts";
import { CHROME_ICONS } from "../lib/assets.ts";
import { formatRefreshedAgo } from "../lib/relativeTime.ts";
import { loadEnabled, loadMutedCategories } from "../notifications/prefs.ts";
import { CATEGORY_ORDER } from "../timers/types.ts";

const PLAY_URL = "https://sunflower-land.com/play";
const DISCORD_URL = "https://discord.gg/sunflowerland";

// App build hash / version, mirrored from DashboardHeader. Read straight
// from the injected env so this view doesn't spin up a second
// `useVersionCheck` poller just for a static label.
const VERSION_LABEL =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ||
  (import.meta.env.VITE_COMMIT_SHA as string | undefined)?.slice(0, 7) ||
  "";

type Screen = "home" | "switch" | "notifications" | "layout" | "about";

const SCREEN_TITLE: Record<Screen, string> = {
  home: "Settings",
  switch: "Switch farm",
  notifications: "Notifications",
  layout: "Layout",
  about: "About & links",
};

type Props = {
  open: boolean;
  onClose: () => void;
  farmId: string;
  data: FarmResponse;
  onLoad: (id: string) => void;
  loading: boolean;
  error?: string;
  // The active page's panel arrangement (timers vs info), driven inline by
  // the Layout sub-screen's drag-to-reorder list. Stable across the 1 Hz
  // clock tick — see usePanelArrangement.
  sheet: PanelSheet;
  // Powers the "About & links" "Refreshed X ago" line. `now` is frozen
  // while Settings is open (App pauses the tick), so the label reflects the
  // moment the modal opened rather than ticking behind the overlay.
  lastFetchedAt?: number;
  now: number;
};

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

// One row of the home list: icon, title, optional status chip, and a
// trailing chevron (rotated into an up-right arrow for external links).
function NavRow({
  icon,
  title,
  status,
  onClick,
  external,
}: {
  icon: string;
  title: string;
  status?: ReactNode;
  onClick: () => void;
  external?: boolean;
}) {
  return (
    <ButtonPanel
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="flex items-center gap-2 cursor-pointer"
    >
      <img
        src={icon}
        alt=""
        aria-hidden
        className="h-8 w-8 shrink-0 object-contain"
        style={{ imageRendering: "pixelated" }}
      />
      <span className="flex-1 truncate text-sm">{title}</span>
      {status}
      <img
        src={CHROME_ICONS.chevron_right}
        alt=""
        aria-hidden
        className="h-[18px] w-[18px] shrink-0 opacity-80"
        style={{
          imageRendering: "pixelated",
          transform: external ? "rotate(-45deg)" : undefined,
        }}
      />
    </ButtonPanel>
  );
}

// Modal opened by the floating gear. A settings-app style drill-down: a
// short home list of rows that each open a focused sub-screen with a Back
// affordance. The home view never grows past a screenful — new settings are
// new rows, not new sections stacked into one scroll.
//
//   home          → Active Farm card + Notifications / Layout / Open
//                   Sunflower Land / About rows.
//   switch        → FarmIdForm (tapping the Active Farm card lands here).
//   notifications → NotificationSettings body.
//   layout        → LayoutPanelGrid for the active page.
//   about         → external links + build/refresh meta.
export function SettingsModal({
  open,
  onClose,
  farmId,
  data,
  onLoad,
  loading,
  error,
  sheet,
  lastFetchedAt,
  now,
}: Props) {
  const [screen, setScreen] = useState<Screen>("home");

  // Reset on prop change via the React-docs prev-state idiom (cheaper than
  // useEffect + setState; no cascading render).
  //
  // 1. Modal closes → snap back to the home list so reopening starts there.
  // 2. data.id changes → a successful load landed. Return home from the
  //    switch screen. Failed loads leave data.id unchanged, so the user
  //    stays on the form and sees the error message.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open && screen !== "home") setScreen("home");
  }
  const [prevDataId, setPrevDataId] = useState(data.id);
  if (prevDataId !== data.id) {
    setPrevDataId(data.id);
    if (screen !== "home") setScreen("home");
  }

  // Home-list notification chip — read straight from prefs (the source of
  // truth NotificationSettings persists to on every toggle). Computed only
  // while the home screen is mounted, so a closed modal doesn't touch
  // localStorage on every clock tick.
  let notifStatus: ReactNode = null;
  if (open && screen === "home") {
    const enabled = loadEnabled();
    const muted = new Set(loadMutedCategories());
    const onCount = CATEGORY_ORDER.filter((c) => !muted.has(c)).length;
    notifStatus = (
      <Label type={enabled ? "success" : "warning"}>
        {enabled ? `${onCount} on` : "Off"}
      </Label>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={SCREEN_TITLE[screen]}
      onBack={screen === "home" ? undefined : () => setScreen("home")}
    >
      {/* Keyed on `screen` so each sub-screen re-mounts and replays the
          slide-in. Transform-only animation — content is never hidden even
          if the keyframe is skipped. */}
      <div key={screen} className="settings-screen-in flex flex-col gap-2">
        {screen === "home" ? (
          <>
            <ActiveFarmPanel data={data} onSwitch={() => setScreen("switch")} />
            <div className="mt-0.5 flex flex-col gap-2">
              <NavRow
                icon={CHROME_ICONS.timer}
                title="Notifications"
                status={notifStatus}
                onClick={() => setScreen("notifications")}
              />
              <NavRow
                icon={getCategoryIcon("Crafting Box")}
                title="Layout"
                onClick={() => setScreen("layout")}
              />
              <NavRow
                icon={CHROME_ICONS.chest}
                title="Open Sunflower Land"
                external
                onClick={() => openExternal(PLAY_URL)}
              />
              <NavRow
                icon={CHROME_ICONS.telegram}
                title="About & links"
                onClick={() => setScreen("about")}
              />
            </div>
          </>
        ) : null}

        {screen === "switch" ? (
          <>
            <FarmIdForm
              initialFarmId={farmId}
              onSubmit={onLoad}
              loading={loading}
              lastLoaded={{ farmId }}
            />
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <Button onClick={() => setScreen("home")}>Back</Button>
          </>
        ) : null}

        {screen === "notifications" ? (
          <NotificationSettings farmId={data.id} />
        ) : null}

        {screen === "layout" ? <LayoutPanelGrid sheet={sheet} /> : null}

        {screen === "about" ? (
          <>
            <Button onClick={() => openExternal(PLAY_URL)}>
              Open Sunflower Land
            </Button>
            <Button onClick={() => openExternal(DISCORD_URL)}>
              Join the Discord
            </Button>
            <div className="mt-1 flex flex-col gap-1">
              {VERSION_LABEL ? (
                <span className="text-xs opacity-70">
                  Version {VERSION_LABEL}
                </span>
              ) : null}
              {lastFetchedAt ? (
                <span className="text-xxs opacity-60">
                  Refreshed {formatRefreshedAgo(lastFetchedAt, now)}
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
