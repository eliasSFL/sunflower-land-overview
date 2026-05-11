// Per-device notification settings panel.
//
// Three controls:
//   1. Master toggle (asks for permission on first enable).
//   2. Per-category opt-in (mirrors CATEGORY_ORDER from `timers/types`).
//   3. Push subscribe/unsubscribe — only enabled when permission is
//      granted, master is on, and the platform supports push.
//
// The component is presentational: it owns no farm data of its own.
// `App.tsx` passes the current `farmId` + `timers` so we can build a
// schedule payload at subscribe time and on every prefs change.

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Label } from "./sfl-ui/index.ts";
import {
  CATEGORY_ORDER,
  type AggregatedTimer,
  type Category,
} from "../timers/index.ts";
import {
  loadPrefs,
  savePrefs,
  type NotifPrefs,
} from "../notifications/prefs.ts";
import {
  requestPermission,
  useNotificationPermission,
} from "../notifications/permission.ts";
import {
  getExistingSubscription,
  isPushSupported,
  subscribePush,
  syncSchedule,
  toSchedule,
  unsubscribePush,
} from "../notifications/subscribe.ts";

type Props = {
  farmId: number | undefined;
  timers: AggregatedTimer[];
  onPrefsChange: (next: NotifPrefs) => void;
};

export function NotificationSettings({ farmId, timers, onPrefsChange }: Props) {
  const [prefs, setPrefs] = useState<NotifPrefs>(() => loadPrefs());
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);
  const [pushBusy, setPushBusy] = useState<boolean>(false);
  const [pushError, setPushError] = useState<string | undefined>();
  const permission = useNotificationPermission();
  const supported = useMemo(() => isPushSupported(), []);

  // Track current push subscription so the toggle reflects reality
  // (the user may have revoked via the OS, or never subscribed).
  useEffect(() => {
    if (!supported) return;
    getExistingSubscription()
      .then((s) => setPushSubscribed(s != null))
      .catch(() => setPushSubscribed(false));
  }, [supported]);

  const update = useCallback(
    (next: NotifPrefs) => {
      setPrefs(next);
      savePrefs(next);
      onPrefsChange(next);
    },
    [onPrefsChange],
  );

  const onMasterToggle = async () => {
    if (!prefs.enabled) {
      if (permission === "default") {
        const result = await requestPermission();
        if (result !== "granted") {
          update({ ...prefs, enabled: false });
          return;
        }
      }
      update({ ...prefs, enabled: true });
    } else {
      update({ ...prefs, enabled: false });
      if (pushSubscribed) {
        await unsubscribePush().catch(() => {});
        setPushSubscribed(false);
      }
    }
  };

  const onCategoryToggle = (cat: Category) => {
    const nextCats = { ...prefs.categories, [cat]: !prefs.categories[cat] };
    const next = { ...prefs, categories: nextCats };
    update(next);
    if (pushSubscribed && farmId != null) {
      void syncSchedule(farmId, nextCats, toSchedule(timers));
    }
  };

  const onPushSubscribe = async () => {
    if (farmId == null) return;
    setPushBusy(true);
    setPushError(undefined);
    try {
      await subscribePush(farmId, prefs.categories, toSchedule(timers));
      setPushSubscribed(true);
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Subscribe failed");
    } finally {
      setPushBusy(false);
    }
  };

  const onPushUnsubscribe = async () => {
    setPushBusy(true);
    setPushError(undefined);
    try {
      await unsubscribePush();
      setPushSubscribed(false);
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Unsubscribe failed");
    } finally {
      setPushBusy(false);
    }
  };

  const permLabel = (() => {
    if (permission === "unsupported") return "unsupported";
    if (permission === "denied") return "blocked";
    if (permission === "granted") return "granted";
    return "ask on enable";
  })();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Notifications</span>
        <Label
          type={
            permission === "granted"
              ? "success"
              : permission === "denied" || permission === "unsupported"
                ? "danger"
                : "default"
          }
        >
          {permLabel}
        </Label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={onMasterToggle}
          disabled={permission === "unsupported" || permission === "denied"}
        />
        <span>Enable notifications on this device</span>
      </label>

      {prefs.enabled ? (
        <fieldset className="flex flex-col gap-1 border-t border-[#3e2731] pt-2">
          <legend className="text-xs text-[#a09cb0]">Categories</legend>
          {CATEGORY_ORDER.map((cat) => (
            <label key={cat} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.categories[cat]}
                onChange={() => onCategoryToggle(cat)}
              />
              <span>{cat}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {prefs.enabled && supported ? (
        <div className="flex flex-col gap-1 border-t border-[#3e2731] pt-2">
          <span className="text-xs text-[#a09cb0]">
            Background push (app closed)
          </span>
          {pushSubscribed ? (
            <Button onClick={onPushUnsubscribe} disabled={pushBusy}>
              {pushBusy ? "Working…" : "Disable background push"}
            </Button>
          ) : (
            <Button
              onClick={onPushSubscribe}
              disabled={pushBusy || farmId == null}
            >
              {pushBusy ? "Working…" : "Enable background push"}
            </Button>
          )}
          {pushError ? (
            <p className="text-xs text-red-700">{pushError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
