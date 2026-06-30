import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchFarm,
  loadCachedFarm,
  ApiError,
  AccessDeniedError,
  type FarmResponse,
} from "../api/fetchFarm.ts";
import { IS_OFFLINE_FARM, OFFLINE_FARM_ID } from "../api/offlineFarm.ts";
import { pullDoSnapshot } from "../notifications/snapshot.ts";
import { savePref } from "../lib/prefs.ts";

export const FARM_ID_KEY = "sfl-overview:farm-id";
export const REFRESH_COOLDOWN_MS = 30_000;

const isString = (v: unknown): v is string => typeof v === "string";

// The farm id lives in the durable `prefs` store (no TTL), not `storage`
// (7-day TTL) — a player shouldn't have to re-enter it just because they
// didn't open the overview for a week. Reads here also migrate a value
// left by the old TTL store (envelope `{v, at}`) by promoting the bare id
// in place, so returning players keep their farm without re-entering even
// once. Both stores use the same localStorage key, so the migrating write
// simply replaces the legacy envelope.
function loadFarmId(): string | undefined {
  try {
    const raw = localStorage.getItem(FARM_ID_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    // Current durable format: a bare string.
    if (isString(parsed)) return parsed;
    // Legacy TTL envelope: lift `.v` out (ignoring its expiry) and promote.
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "v" in parsed &&
      isString((parsed as { v: unknown }).v)
    ) {
      const id = (parsed as { v: string }).v;
      savePref(FARM_ID_KEY, id);
      return id;
    }
  } catch {
    // Malformed entry — treat as absent.
  }
  return undefined;
}

export type FarmData = {
  farmId: string;
  data: FarmResponse | undefined;
  loading: boolean;
  error: string | undefined;
  accessDenied: boolean;
  lastFetchedAt: number | undefined;
  load: (id: string) => Promise<void>;
};

export function useFarmData(): FarmData {
  const [farmId, setFarmId] = useState<string>(() =>
    // Offline mode pre-fills the snapshot's id; the auto-load effect below
    // loads it on mount with no entry needed.
    IS_OFFLINE_FARM ? OFFLINE_FARM_ID : (loadFarmId() ?? ""),
  );
  // Seed from the localStorage cache so a reload paints the farm
  // immediately. The `fetchedAt` stamp keeps the "last refreshed" label
  // truthful across sessions and respects the refresh cooldown. Skipped
  // offline so a previously-cached real farm can't shadow the snapshot.
  const initialCache = useMemo(() => {
    if (IS_OFFLINE_FARM) return undefined;
    const id = loadFarmId();
    return id ? loadCachedFarm(id) : undefined;
    // Run once on mount — deps left empty intentionally.
  }, []);
  const [data, setData] = useState<FarmResponse | undefined>(
    () => initialCache?.data,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [accessDenied, setAccessDenied] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | undefined>(
    () => initialCache?.fetchedAt,
  );

  const inFlightRef = useRef<Promise<void> | undefined>(undefined);

  // On mount: if we have a cached farm, ask the DO whether it's seen
  // a newer snapshot since the cache's `at` timestamp. The Coordinator
  // updates DO state every 10 min regardless of whether the PWA was
  // open, so this catches state changes the player made in the main
  // game while the overview was closed.
  useEffect(() => {
    if (!initialCache || !data) return;
    let cancelled = false;
    (async () => {
      // `.catch(() => null)` collapses any unexpected throw from the
      // DO call into the same no-op path as a "no update" response —
      // an unhandled rejection here would otherwise surface on the
      // window since the IIFE is fire-and-forget.
      const fresher = await pullDoSnapshot(
        data.id,
        initialCache.fetchedAt,
      ).catch(() => null);
      if (cancelled || !fresher) return;
      // Re-load from localStorage so makeGame() runs over the freshly-
      // written payload — keeps Decimal hydration logic in one place.
      const reloaded = loadCachedFarm(data.id);
      if (reloaded) {
        setData(reloaded.data);
        setLastFetchedAt(reloaded.fetchedAt);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount — `initialCache` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (id: string): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    if (
      lastFetchedAt &&
      Date.now() - lastFetchedAt < REFRESH_COOLDOWN_MS &&
      id === farmId
    ) {
      return;
    }
    setLoading(true);
    setError(undefined);
    setAccessDenied(false);
    const p = (async () => {
      try {
        const resp = await fetchFarm(id);
        setData(resp);
        // Persist the id we actually loaded, not the one that was typed:
        // in offline mode `fetchFarm` ignores `id` and returns the
        // snapshot's own farm, so keying the input/cooldown/storage off
        // `resp.id` keeps them consistent with `data`. Online, `resp.id`
        // is just the canonical numeric form of the requested id.
        const actualId = resp.id != null ? String(resp.id) : id;
        setFarmId(actualId);
        savePref(FARM_ID_KEY, actualId);
        setLastFetchedAt(Date.now());
      } catch (e) {
        if (e instanceof AccessDeniedError) {
          // Clear any previously-loaded farm so the denial panel surfaces
          // immediately — without this, a stale `data` from an earlier
          // successful load keeps the dashboard rendered. Also drop
          // `lastFetchedAt` (the 30s cooldown would otherwise silently
          // block re-submitting the previously-successful farm) and
          // align `farmId` with the denied attempt so the re-mounted
          // form's pre-fill matches the denial copy.
          setData(undefined);
          setLastFetchedAt(undefined);
          setFarmId(id);
          setAccessDenied(true);
        } else if (e instanceof ApiError) {
          setError(`${e.status} — ${e.message}`);
        } else if (e instanceof Error) {
          setError(e.message);
        } else {
          setError("Unknown error");
        }
      } finally {
        setLoading(false);
        inFlightRef.current = undefined;
      }
    })();
    inFlightRef.current = p;
    return p;
  };

  // Local-only mode: auto-load the static snapshot on mount so the
  // dashboard appears with no farm-id entry and no Worker running. Flag-
  // gated, so the production data path is byte-for-byte unchanged.
  // Deferred to a microtask so `load`'s mount-time setState lands after
  // commit, not synchronously in the effect body (set-state-in-effect).
  useEffect(() => {
    if (!IS_OFFLINE_FARM) return;
    void Promise.resolve().then(() => load(OFFLINE_FARM_ID));
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { farmId, data, loading, error, accessDenied, lastFetchedAt, load };
}
