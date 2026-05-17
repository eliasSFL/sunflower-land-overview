import { useState } from "react";

import { usePwaInstall } from "../hooks/usePwaInstall.ts";
import { Button, InnerPanel, Label } from "./ui/index.ts";

// Above-the-fold nudge to install the site as a PWA. We need
// standalone-mode install for two reasons:
//   1. iOS Safari only fires Web Push to apps added to the Home Screen.
//   2. Even on Android/desktop Chromium, standalone keeps the
//      service-worker subscription alive past tab closures, so
//      notifications actually arrive when timers fire.
//
// Hides itself once the display-mode flips to standalone (the
// `usePwaInstall` hook watches the media query). On iOS Safari (no
// programmatic prompt) we render manual Share → Add to Home Screen
// instructions instead of an install button. In contexts where install
// isn't possible (Firefox desktop, in-app browsers, etc.) the panel
// stays hidden — there's nothing the user can act on.
export function PwaInstallPanel() {
  const { installed, iosManual, canPrompt, promptInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);

  if (installed) return null;
  if (!iosManual && !canPrompt) return null;

  async function onInstall() {
    setBusy(true);
    try {
      await promptInstall();
    } finally {
      setBusy(false);
    }
  }

  return (
    <InnerPanel className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2">
        <Label type="default">Install the app</Label>
      </div>
      <p>
        Install Sunflower Land Overview as an app to receive push notifications
        when your timers are ready — even while the app is closed.
      </p>
      <p className="text-xs">
        Once installed, open the app and enable notifications in Settings.
      </p>
      {iosManual ? (
        <ol className="list-decimal pl-5 space-y-1 text-xs">
          <li>Tap the share button in Safari.</li>
          <li>
            Choose <strong>Add to Home Screen</strong>.
          </li>
          <li>Open the app from your Home Screen.</li>
        </ol>
      ) : (
        <Button onClick={onInstall} disabled={busy || !canPrompt}>
          Install app
        </Button>
      )}
    </InnerPanel>
  );
}
