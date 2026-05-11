// Surfaces the browser's PWA install prompt.
//
// Two paths:
//   1. Chromium/Edge/Android — capture `beforeinstallprompt`, show a
//      button that calls `prompt()` on user gesture.
//   2. iOS Safari — no event; show static "Add to Home Screen" copy.
//      Web Push on iOS requires Add to Home Screen first, so the
//      instructions live here rather than in the notifications panel.
//
// Hides itself once installed (display-mode: standalone) or once the
// `appinstalled` event has fired.

import { useEffect, useState } from "react";
import { Button, Label } from "./sfl-ui/index.ts";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) && !("MSStream" in window)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS pre-PWA flag, still respected by Safari on iPadOS/iOS.
  const navAny = window.navigator as Navigator & { standalone?: boolean };
  return navAny.standalone === true;
}

export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | undefined>();
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());
  const ios = isIOS();

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!evt && !ios) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-[#3e2731] pt-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Install</span>
        <Label type="info">PWA</Label>
      </div>
      {evt ? (
        <Button
          onClick={async () => {
            await evt.prompt();
            await evt.userChoice;
            setEvt(undefined);
          }}
        >
          Install app
        </Button>
      ) : (
        <p className="text-xs">
          Tap the share icon, then <strong>Add to Home Screen</strong> to
          install. Background notifications on iOS require the app to be
          installed.
        </p>
      )}
    </div>
  );
}
