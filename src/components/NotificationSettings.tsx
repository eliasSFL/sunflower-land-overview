import { useEffect, useState } from "react";

import { Button, Label } from "./ui/index.ts";
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
  postTest,
} from "../notifications/api.ts";
import {
  loadEnabled,
  saveEnabled,
  clearEnabled,
} from "../notifications/prefs.ts";

type Props = {
  farmId: number;
};

// v1 surface: master toggle + test button + iOS install hint. Categories
// (per-domain mute) live in v2 — the DO wire format already accepts a
// `categories` field so v2 is purely additive.
export function NotificationSettings({ farmId }: Props) {
  const [permission, setPermission] = useState<PermissionState>(() =>
    getPermissionState(),
  );
  const [enabled, setEnabled] = useState<boolean>(() => loadEnabled());
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
      const res = await postTest({ farmId });
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

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Get a push notification when timers on your farm are ready — even while
        the app is closed.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Label type={enabled ? "default" : "warning"}>
          {enabled ? "Enabled" : "Disabled"}
        </Label>
        {permission === "denied" ? (
          <Label type="danger">Permission denied</Label>
        ) : null}
      </div>
      {enabled ? (
        <>
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
