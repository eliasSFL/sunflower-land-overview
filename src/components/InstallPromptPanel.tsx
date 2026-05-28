import { useEffect, useState } from "react";

import {
  canSubscribe,
  getPermissionState,
  isIOS,
  isStandalone,
} from "../notifications/permission.ts";
import { loadEnabled } from "../notifications/prefs.ts";
import { enableNotifications } from "../notifications/enable.ts";
import {
  getDeferredPrompt,
  showInstallPrompt,
  subscribeInstallPrompt,
} from "../notifications/installPrompt.ts";
import { Button, InnerPanel, Label } from "./ui/index.ts";
import { CHROME_ICONS } from "../lib/assets.ts";

// Dashboard nag panel that pushes players toward installing the PWA
// (so they can receive push notifications even when the tab is
// closed). Once installed, the same panel switches to a "turn on
// notifications" CTA. Hides itself once both are done — or for the
// rest of this tab session if the player dismisses it.

const DISMISS_KEY = "sfl-overview:installPrompt:dismissed";

function isDismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function dismissThisSession(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* noop */
  }
}

type View =
  | { kind: "hidden" }
  | { kind: "install-prompt" } // Chromium with a saved beforeinstallprompt event
  | { kind: "install-ios" } // iOS Safari — Add to Home Screen instructions
  | { kind: "enable-notifications" };

function computeView({
  dismissed,
  installed,
  notificationsOn,
  hasDeferredPrompt,
  permissionDefault,
}: {
  dismissed: boolean;
  installed: boolean;
  notificationsOn: boolean;
  hasDeferredPrompt: boolean;
  permissionDefault: boolean;
}): View {
  if (dismissed) return { kind: "hidden" };
  if (installed && notificationsOn) return { kind: "hidden" };

  if (!installed) {
    if (hasDeferredPrompt) return { kind: "install-prompt" };
    // iOS Safari is the only mainstream install path without a
    // `beforeinstallprompt` event — show A2HS copy. iPadOS reports a
    // desktop UA but `isIOS()` already handles that case.
    if (isIOS()) return { kind: "install-ios" };
    // Browser with no available install path yet (Android Chrome
    // before its engagement heuristics fire `beforeinstallprompt`,
    // desktop Firefox, etc). Stay hidden rather than surfacing the
    // notifications CTA — per spec, prompting for notifications only
    // happens once the player is in the installed PWA.
    return { kind: "hidden" };
  }

  // Installed but notifications aren't on.
  if (canSubscribe() && permissionDefault) {
    return { kind: "enable-notifications" };
  }
  return { kind: "hidden" };
}

type Props = {
  farmId: number;
};

export function InstallPromptPanel({ farmId }: Props) {
  const [dismissed, setDismissed] = useState(() => isDismissedThisSession());
  const [installed, setInstalled] = useState(() => isStandalone());
  const [hasDeferredPrompt, setHasDeferredPrompt] = useState(
    () => getDeferredPrompt() !== null,
  );
  const [permission, setPermission] = useState(() => getPermissionState());
  const [enabled, setEnabledState] = useState(() => loadEnabled());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  // beforeinstallprompt / appinstalled → re-render.
  useEffect(() => {
    return subscribeInstallPrompt(() => {
      setHasDeferredPrompt(getDeferredPrompt() !== null);
    });
  }, []);

  // display-mode flip (rare — fires when the user installs and the tab
  // re-opens in standalone mode).
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const onChange = (e: MediaQueryListEvent) => setInstalled(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Re-check permission + enabled when the tab regains focus. The user
  // may have flipped notifications in browser site settings without us
  // observing — `Notification.permission` has no change event.
  useEffect(() => {
    const sync = () => {
      setPermission(getPermissionState());
      setEnabledState(loadEnabled());
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const view = computeView({
    dismissed,
    installed,
    notificationsOn: enabled && permission === "granted",
    hasDeferredPrompt,
    permissionDefault: permission === "default",
  });

  if (view.kind === "hidden") return null;

  const onDismiss = () => {
    dismissThisSession();
    setDismissed(true);
  };

  const onInstall = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const outcome = await showInstallPrompt();
      if (outcome === "accepted") {
        // appinstalled will flip isInstalled; nothing else to do.
      } else if (outcome === "dismissed") {
        // Keep the panel visible — the user can try again later.
      } else {
        setError("Install prompt isn't available right now.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const onEnable = async () => {
    setBusy(true);
    setError(undefined);
    const result = await enableNotifications(farmId);
    setPermission(result.permission);
    if (result.ok) setEnabledState(true);
    else setError(result.error);
    setBusy(false);
  };

  return (
    <InnerPanel className="flex flex-col gap-2">
      <header className="flex items-center justify-between gap-2">
        <Label type="info">
          {view.kind === "enable-notifications"
            ? "Notifications"
            : "Install app"}
        </Label>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 cursor-pointer opacity-70 hover:opacity-100"
        >
          <img
            src={CHROME_ICONS.close}
            alt=""
            aria-hidden
            className="h-4 w-4 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        </button>
      </header>

      {view.kind === "install-prompt" ? (
        <>
          <p className="text-xs">
            Install{" "}
            {(import.meta.env.VITE_APP_NAME as string | undefined) ??
              "Sunflower Land Overview"}{" "}
            to get push notifications when your timers are ready — even with the
            app closed.
          </p>
          <Button onClick={() => void onInstall()} disabled={busy}>
            Install app
          </Button>
        </>
      ) : null}

      {view.kind === "install-ios" ? (
        <>
          <p className="text-xs">
            <strong>Install required.</strong> iOS only delivers push
            notifications to apps installed to the Home Screen.
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-xs">
            <li>Tap the share button in Safari.</li>
            <li>
              Choose <strong>Add to Home Screen</strong>.
            </li>
            <li>Open the app from your Home Screen, then return here.</li>
          </ol>
        </>
      ) : null}

      {view.kind === "enable-notifications" ? (
        <>
          <p className="text-xs">
            Turn on notifications to get pinged when your timers are ready.
          </p>
          <Button onClick={() => void onEnable()} disabled={busy}>
            Enable notifications
          </Button>
        </>
      ) : null}

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </InnerPanel>
  );
}
