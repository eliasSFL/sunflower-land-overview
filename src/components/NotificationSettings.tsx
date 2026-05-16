import { useEffect, useState } from "react";

import { Button, Checkbox, Radio, Label, SectionHeader } from "./ui/index.ts";
import {
  canSubscribe,
  getPermissionState,
  isIOS,
  isStandalone,
  requestPermission,
  type PermissionState,
} from "../notifications/permission.ts";
import {
  getExistingSubscription,
  subscribePush,
  unsubscribePush,
} from "../notifications/subscribe.ts";
import {
  postSubscribe,
  postUnsubscribe,
  postCategories,
  postNotificationTarget,
  postTest,
} from "../notifications/api.ts";
import {
  loadEnabled,
  saveEnabled,
  clearEnabled,
  loadMutedCategories,
  saveMutedCategories,
  loadNotificationTarget,
  saveNotificationTarget,
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

  // Re-sync UI state with the actual browser subscription on mount —
  // covers the case where the user revoked permission outside the app.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sub = await getExistingSubscription();
      const live = sub !== null;
      const flag = loadEnabled();
      if (!cancelled && live !== flag) {
        // Browser is authoritative.
        saveEnabled(live);
        setEnabled(live);
      }
      if (!cancelled) setPermission(getPermissionState());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    try {
      const perm = await requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Permission denied. Re-enable it in your browser site settings."
            : "Permission not granted.",
        );
        return;
      }
      const sub = await subscribePush();
      if (!sub) {
        setError("Couldn't create a subscription on this device.");
        return;
      }
      const res = await postSubscribe({
        farmId,
        subscription: sub.toJSON() as PushSubscriptionJSON,
        mutedCategories: [...muted],
        notificationTarget: target,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Subscribe failed: ${res.status}`);
        return;
      }
      saveEnabled(true);
      setEnabled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
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
