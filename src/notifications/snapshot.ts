// On PWA reopen, ask the DO for its snapshot. If `fetchedAt` is newer
// than what's already in localStorage, replace the cache so the UI
// reflects the most recent server-side observation without an extra
// upstream call.

import type { FarmResponse } from "../api/fetchFarm.ts";

const FARM_CACHE_PREFIX = "sfl-overview:farm:";

const farmCacheKey = (farmId: string | number) =>
  `${FARM_CACHE_PREFIX}${String(farmId).trim()}`;

type SnapshotResponse =
  | { notModified: true }
  | { raw: FarmResponse; fetchedAt: number };

export async function pullDoSnapshot(
  farmId: string | number,
  cachedAt: number,
): Promise<{ raw: FarmResponse; fetchedAt: number } | null> {
  const id = String(farmId).trim();
  if (!/^\d+$/.test(id)) return null;
  let res: Response;
  try {
    res = await fetch(`/push/state/${id}?since=${Math.floor(cachedAt)}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let body: SnapshotResponse;
  try {
    body = (await res.json()) as SnapshotResponse;
  } catch {
    return null;
  }
  if ("notModified" in body) return null;
  try {
    localStorage.setItem(
      farmCacheKey(id),
      JSON.stringify({ v: body.raw, at: body.fetchedAt }),
    );
  } catch {
    // Quota exceeded or storage disabled — ignore; caller still gets
    // the fresh payload in memory.
  }
  return { raw: body.raw, fetchedAt: body.fetchedAt };
}
