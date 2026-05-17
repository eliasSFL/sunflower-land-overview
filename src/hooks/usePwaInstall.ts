import { useCallback, useEffect, useState } from "react";

import { isIOS, isStandalone } from "../notifications/permission.ts";

// Chromium-only event; not in lib.dom yet.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PwaInstallState = {
  // True once the app is running in standalone (installed) display mode.
  installed: boolean;
  // True for iOS Safari outside standalone — no programmatic prompt,
  // user must Add to Home Screen via the share sheet.
  iosManual: boolean;
  // True when we captured a beforeinstallprompt event and can call
  // promptInstall() to surface Chromium's native install dialog.
  canPrompt: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

// Captures the beforeinstallprompt event so the UI can fire it on a
// user gesture. Also tracks the display-mode flip so the panel hides
// the instant the app moves to standalone.
export function usePwaInstall(): PwaInstallState {
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    const mql = window.matchMedia("(display-mode: standalone)");
    const onDisplayMode = (e: MediaQueryListEvent) => setInstalled(e.matches);
    mql.addEventListener("change", onDisplayMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      mql.removeEventListener("change", onDisplayMode);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event can only be used once; drop it either way.
    setDeferred(null);
    return outcome;
  }, [deferred]);

  return {
    installed,
    iosManual: !installed && isIOS(),
    canPrompt: !installed && deferred !== null,
    promptInstall,
  };
}
