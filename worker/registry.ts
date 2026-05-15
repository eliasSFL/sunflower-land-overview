import type { Env } from "./types.ts";

// D1 helpers for the global opted-in registry. The Coordinator reads
// the set up-front each sweep and filters paginated farm responses
// against it. FarmPushDO mutates it from subscribe()/unsubscribe().

export async function addOptIn(env: Env, farmId: number): Promise<void> {
  await env.sfl_overview_push
    .prepare(
      `INSERT INTO opted_in (farm_id, subscribed_at)
       VALUES (?1, ?2)
       ON CONFLICT(farm_id) DO NOTHING`,
    )
    .bind(farmId, Date.now())
    .run();
}

export async function removeOptIn(env: Env, farmId: number): Promise<void> {
  await env.sfl_overview_push
    .prepare(`DELETE FROM opted_in WHERE farm_id = ?1`)
    .bind(farmId)
    .run();
}

export async function listOptedInIds(env: Env): Promise<number[]> {
  const res = await env.sfl_overview_push
    .prepare(`SELECT farm_id FROM opted_in`)
    .all<{ farm_id: number }>();
  return (res.results ?? []).map((r) => r.farm_id);
}

// `last_synced_at` was historically maintained here as a per-farm
// `markSynced` write at the end of each sweep. The column stays in
// the table (storage is rounding noise) but we no longer write to it
// — the DO's own `state.snapshot.fetchedAt` is the source of truth
// for "when did this farm last refresh", and avoiding the per-sweep
// write saves N D1 row-writes × 4,320 sweeps/month.
