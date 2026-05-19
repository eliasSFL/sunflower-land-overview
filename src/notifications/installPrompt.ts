// Captures the browser's `beforeinstallprompt` event so the install
// CTA in InstallPromptPanel can fire `prompt()` later. The event only
// fires once per page load on Chromium browsers when the install
// criteria are met, so we stash it at module load and expose a
// subscribe() so React components can re-render when it arrives or
// gets consumed.
//
// `appinstalled` clears the deferred prompt — if the user installs via
// the browser's own menu rather than our button, the saved event
// becomes unusable.

// Chromium's BeforeInstallPromptEvent isn't in lib.dom yet.
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Listener = () => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Fires the saved prompt and clears it (the event is single-use per
// spec). Returns the user's choice so the caller can decide whether
// to keep the panel visible.
export async function showInstallPrompt(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const evt = deferredPrompt;
  if (!evt) return "unavailable";
  deferredPrompt = null;
  notify();
  await evt.prompt();
  const { outcome } = await evt.userChoice;
  return outcome;
}
