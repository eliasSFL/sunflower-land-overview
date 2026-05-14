import { useEffect, useState } from "react";

import { CATEGORY_ORDER, type Category } from "../timers/types.ts";
import { Button, InnerPanel, Label } from "./ui/index.ts";
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
  deleteSubscribe,
  postSubscribe,
  postTestPush,
  type CategoryPrefs,
} from "../notifications/api.ts";
import {
  clearEnabled,
  loadCategories,
  loadEnabled,
  saveCategories,
  saveEnabled,
} from "../notifications/prefs.ts";

type Props = {
  farmId: number | undefined;
};

export function NotificationSettings({ farmId }: Props) {
  const [enabled, setEnabled] = useState<boolean>(() => loadEnabled());
  const [categories, setCategories] = useState<CategoryPrefs>(() =>
    loadCategories(),
  );
  const [permission, setPermission] = useState<PermissionState>(() =>
    getPermissionState(),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [endpoint, setEndpoint] = useState<string | undefined>();

  useEffect(() => {
    void (async () => {
      const sub = await getExistingSubscription();
      if (sub) setEndpoint(sub.endpoint);
    })();
  }, []);

  // Persist category changes immediately, and re-sync with the Worker
  // when the master toggle is on so the server stays current without
  // a separate save button.
  useEffect(() => {
    saveCategories(categories);
    if (!enabled || !endpoint || farmId === undefined) return;
    void (async () => {
      const sub = await getExistingSubscription();
      if (!sub) return;
      await postSubscribe({
        subscription: sub.toJSON(),
        farmId,
        categories,
      });
    })();
  }, [categories, enabled, endpoint, farmId]);

  const iosNotInstalled = isIOS() && !isStandalone();
  const unsupported = permission === "unsupported" || !canSubscribe();

  const handleEnable = async () => {
    if (farmId === undefined) {
      setMessage("Load a farm first");
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      let state = permission;
      if (state !== "granted") {
        state = await requestPermission();
        setPermission(state);
      }
      if (state !== "granted") {
        setMessage("Permission denied");
        return;
      }
      const sub = await subscribePush();
      if (!sub) {
        setMessage("Could not subscribe (no service worker)");
        return;
      }
      const res = await postSubscribe({
        subscription: sub.toJSON(),
        farmId,
        categories,
      });
      if (!res.ok) {
        setMessage(`Subscribe failed (${res.status})`);
        return;
      }
      setEndpoint(sub.endpoint);
      setEnabled(true);
      saveEnabled(true);
      setMessage("Subscribed");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Subscribe error");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setMessage(undefined);
    try {
      const sub = await getExistingSubscription();
      if (sub) {
        await deleteSubscribe(sub.endpoint);
      }
      await unsubscribePush();
      setEnabled(false);
      clearEnabled();
      setEndpoint(undefined);
      setMessage("Unsubscribed");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unsubscribe error");
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    if (!endpoint) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const res = await postTestPush(endpoint);
      setMessage(res.ok ? "Test sent" : `Test failed (${res.status})`);
    } finally {
      setBusy(false);
    }
  };

  const toggleCategory = (cat: Category) => {
    setCategories((prev) => ({ ...prev, [cat]: !(prev[cat] ?? true) }));
  };

  return (
    <InnerPanel className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label type="default">Notifications</Label>
        {enabled ? <Label type="success">on</Label> : null}
      </div>

      {unsupported && !iosNotInstalled ? (
        <p className="text-xs">
          This browser doesn&apos;t support Web Push.
        </p>
      ) : null}

      {iosNotInstalled ? (
        <p className="text-xs">
          On iOS, first add this app to your home screen via the Share
          menu, then open it from there to enable notifications.
        </p>
      ) : null}

      {!unsupported && !iosNotInstalled ? (
        <>
          {!enabled ? (
            <Button onClick={handleEnable} disabled={busy || farmId === undefined}>
              {busy ? "Working…" : "Enable notifications"}
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Button onClick={handleTest} disabled={busy}>
                {busy ? "Working…" : "Send test notification"}
              </Button>
              <Button onClick={handleDisable} disabled={busy}>
                {busy ? "Working…" : "Disable"}
              </Button>
            </div>
          )}

          {enabled ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs">Categories</span>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {CATEGORY_ORDER.map((cat) => (
                  <label
                    key={cat}
                    className="flex items-center gap-1 text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={categories[cat] ?? true}
                      onChange={() => toggleCategory(cat)}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {message ? <p className="text-xs">{message}</p> : null}
    </InnerPanel>
  );
}
