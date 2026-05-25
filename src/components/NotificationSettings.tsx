import { useEffect, useState } from "react";

import {
  Button,
  Checkbox,
  Radio,
  Label,
  SectionHeader,
  InnerPanel,
} from "./ui/index.ts";
import {
  canSubscribe,
  getPermissionState,
  isAndroid,
  isIOS,
  isStandalone,
  type PermissionState,
} from "../notifications/permission.ts";
import {
  getExistingSubscription,
  unsubscribePush,
} from "../notifications/subscribe.ts";
import {
  postUnsubscribe,
  postCategories,
  postNotificationTarget,
  postTest,
} from "../notifications/api.ts";
import { enableNotifications } from "../notifications/enable.ts";
import {
  loadEnabled,
  saveEnabled,
  clearEnabled,
  loadMutedCategories,
  saveMutedCategories,
  loadNotificationTarget,
  saveNotificationTarget,
  loadLastRegisteredEndpoint,
  clearLastRegisteredEndpoint,
  loadAndroidPwaTipDismissed,
  saveAndroidPwaTipDismissed,
  type NotificationTarget,
} from "../notifications/prefs.ts";
import { CATEGORY_ORDER, type Category } from "../timers/types.ts";
import { getCategoryIcon } from "./categoryIcon.ts";

type Props = {
  farmId: number;
};

export function NotificationSettings({ farmId }: Props) {
  const [permission, setPermission] = useState<PermissionState>(() =>
    getPermissionState(),
  );
  const [enabled, setEnabled] = useState<boolean>(() => loadEnabled());
  const [muted, setMuted] = useState<Set<Category>>(
    () => new Set(loadMutedCategories()),
  );
  const [target, setTarget] = useState<NotificationTarget>(() =>
    loadNotificationTarget(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [testStatus, setTestStatus] = useState<string | undefined>();
  const [androidPwaTipDismissed, setAndroidPwaTipDismissed] = useState<boolean>(
    () => loadAndroidPwaTipDismissed(),
  );

  function dismissAndroidPwaTip() {
    saveAndroidPwaTipDismissed(true);
    setAndroidPwaTipDismissed(true);
  }

  // Show the Android "Open supported links" tip only when it's
  // actually actionable: the user picked the main-game target (so
  // notifications navigate cross-origin), they're on Android (the
  // workaround is Android-specific — iOS/desktop don't have this app
  // links dispatcher), and they haven't already dismissed it.
  const showAndroidPwaTip =
    target === "play" && isAndroid() && !androidPwaTipDismissed;

  // Re-sync UI state with the actual browser subscription on mount.
  //
  // Two scenarios warrant a silent repair instead of showing "Disabled":
  //
  //   a) localStorage says enabled + permission is still granted, but
  //      the live PushSubscription is gone. Chrome auto-revokes subs
  //      for low-engagement origins, push services expire endpoints,
  //      storage eviction can drop subs, and the SW's
  //      pushsubscriptionchange handler may have failed to recover
  //      on its own with no clients open. Flipping enabled=false here
  //      makes it look like the user turned it off themselves.
  //
  //   b) Live sub exists, but its endpoint differs from the one we
  //      last registered. The SW (or the push service) silently
  //      rotated the sub while the app was closed; the server still
  //      thinks it should be pushing to the old endpoint, which will
  //      410 + get pruned next time it fires. Re-POST so the new
  //      endpoint is the one the DO knows about.
  //
  // In both cases enableNotifications() reuses the granted permission
  // without re-prompting and posts the current local prefs along with
  // the (possibly fresh) subscription. If permission really did get
  // revoked the repair short-circuits and we fall through to the
  // browser-is-authoritative behavior so the UI reflects reality.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sub = await getExistingSubscription();
      const live = sub !== null;
      const flag = loadEnabled();
      const perm = getPermissionState();
      const lastEndpoint = loadLastRegisteredEndpoint();
      if (cancelled) return;
      setPermission(perm);

      const needsRepair =
        flag &&
        perm === "granted" &&
        (!live || (sub !== null && sub.endpoint !== lastEndpoint));

      if (needsRepair) {
        const result = await enableNotifications(farmId);
        if (cancelled) return;
        setPermission(result.permission);
        if (result.ok) {
          setEnabled(true);
        } else {
          // Surface the error but leave the flag intact — the player
          // can hit Disable manually if they want to give up on this
          // device. Common failure here is permission flipping to
          // "denied" between the pre-check and requestPermission().
          setError(result.error);
        }
        return;
      }

      if (live !== flag) {
        // Browser is authoritative.
        saveEnabled(live);
        setEnabled(live);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  if (isIOS() && !isStandalone()) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>
          <strong>Install required.</strong> iOS only delivers push
          notifications to apps installed to the Home Screen.
        </p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Tap the share button in Safari.</li>
          <li>
            Choose <strong>Add to Home Screen</strong>.
          </li>
          <li>Open the app from your Home Screen, then return here.</li>
        </ol>
      </div>
    );
  }

  if (!canSubscribe()) {
    return (
      <p className="text-sm">
        Push notifications aren't supported by this browser.
      </p>
    );
  }

  async function onEnable() {
    setBusy(true);
    setError(undefined);
    setTestStatus(undefined);
    const result = await enableNotifications(farmId);
    setPermission(result.permission);
    if (result.ok) setEnabled(true);
    else setError(result.error);
    setBusy(false);
  }

  async function onDisable() {
    setBusy(true);
    setError(undefined);
    setTestStatus(undefined);
    try {
      const sub = await getExistingSubscription();
      const endpoint = sub?.endpoint;
      const result = await unsubscribePush();
      if (endpoint) {
        // Best-effort cleanup on the server. If it fails the DO's 410
        // pruning will catch it on the next push.
        await postUnsubscribe({ farmId, endpoint }).catch(() => {});
      }
      void result;
      clearEnabled();
      clearLastRegisteredEndpoint();
      setEnabled(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    setBusy(true);
    setError(undefined);
    setTestStatus(undefined);
    try {
      const sub = await getExistingSubscription();
      if (!sub) {
        setError("No active subscription on this device.");
        return;
      }
      const res = await postTest({ farmId, endpoint: sub.endpoint });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Test failed: ${res.status}`);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        sent?: number;
        pruned?: number;
      };
      setTestStatus(
        `Sent to ${body.sent ?? 0} device(s)` +
          (body.pruned ? ` · pruned ${body.pruned} dead` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  // Optimistically flip the destination, persist, then sync the
  // server. The DO pulls this per-fire when building the push
  // payload's url, so the change applies to the next push.
  async function onChangeTarget(next: NotificationTarget) {
    setTarget(next);
    saveNotificationTarget(next);
    const sub = await getExistingSubscription();
    if (!sub) return;
    try {
      const res = await postNotificationTarget({
        farmId,
        endpoint: sub.endpoint,
        notificationTarget: next,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Update failed: ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  // Optimistically toggle the local set, persist, then fire-and-forget
  // sync to the Worker. If the server call fails we surface an error
  // but leave the local pref alone — next subscribe will re-send the
  // current mute list anyway.
  async function onToggleCategory(category: Category, checked: boolean) {
    const next = new Set(muted);
    if (checked) next.delete(category);
    else next.add(category);
    setMuted(next);
    saveMutedCategories([...next]);

    const sub = await getExistingSubscription();
    if (!sub) return;
    try {
      const res = await postCategories({
        farmId,
        endpoint: sub.endpoint,
        mutedCategories: [...next],
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Update failed: ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <section className="flex flex-col gap-2">
        <SectionHeader>Notifications</SectionHeader>
        <p>
          Get a push notification when timers on your farm are ready — even
          while the app is closed.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Label type={enabled ? "success" : "warning"}>
            {enabled ? "Enabled" : "Disabled"}
          </Label>
          {permission === "denied" ? (
            <Label type="danger">Permission denied</Label>
          ) : null}
        </div>
        {enabled ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs">Notify me about:</span>
            <ul className="scrollable flex flex-col gap-2 overflow-auto max-h-44 px-2">
              {CATEGORY_ORDER.map((cat) => {
                const checked = !muted.has(cat);
                return (
                  <li key={cat} className="flex items-center gap-2">
                    <Checkbox
                      checked={checked}
                      onChange={(c) => void onToggleCategory(cat, c)}
                      disabled={busy}
                    />
                    <img
                      src={getCategoryIcon(cat)}
                      alt=""
                      className="w-6 h-6"
                      style={{ imageRendering: "pixelated" }}
                    />
                    <span>{cat}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>
      {enabled ? (
        <>
          <section className="flex flex-col gap-2">
            <SectionHeader>When opened</SectionHeader>
            <div
              role="button"
              tabIndex={busy ? -1 : 0}
              onClick={() => void onChangeTarget("overview")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void onChangeTarget("overview");
                }
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Radio
                checked={target === "overview"}
                onChange={() => void onChangeTarget("overview")}
                disabled={busy}
              />
              <span>Overview (this app)</span>
            </div>
            <div
              role="button"
              tabIndex={busy ? -1 : 0}
              onClick={() => void onChangeTarget("play")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void onChangeTarget("play");
                }
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Radio
                checked={target === "play"}
                onChange={() => void onChangeTarget("play")}
                disabled={busy}
              />
              <span>Main game (sunflower-land.com/play)</span>
            </div>
            {showAndroidPwaTip ? (
              <InnerPanel className="flex flex-col gap-2 text-xs">
                <p>
                  <strong>Have the Sunflower Land app installed?</strong> By
                  default Android opens notification links in a browser tab.
                  To launch them in the installed app instead:
                </p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>
                    Long-press the Sunflower Land app icon and open{" "}
                    <strong>App info</strong>.
                  </li>
                  <li>
                    Tap <strong>Set as default</strong> →{" "}
                    <strong>Supported web addresses</strong>.
                  </li>
                  <li>
                    Toggle on <strong>sunflower-land.com</strong>.
                  </li>
                </ol>
                <div>
                  <Button onClick={dismissAndroidPwaTip} disabled={busy}>
                    Got it
                  </Button>
                </div>
              </InnerPanel>
            ) : null}
          </section>
          <Button onClick={onTest} disabled={busy}>
            Send test notification
          </Button>
          <Button onClick={onDisable} disabled={busy}>
            Disable notifications
          </Button>
        </>
      ) : (
        <Button onClick={onEnable} disabled={busy || permission === "denied"}>
          Enable notifications
        </Button>
      )}
      {testStatus ? <p className="text-xs">{testStatus}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
