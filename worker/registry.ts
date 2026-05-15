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

// Mark the farms that the latest sweep actually saw. Helps detect
// "opted-in but never returned by upstream" (account deletion,
// blacklisting, or a cursor skip).
export async function markSynced(
  env: Env,
  farmIds: number[],
  at: number,
): Promise<void> {
  if (farmIds.length === 0) return;
  const placeholders = farmIds.map(() => "?").join(",");
  await env.sfl_overview_push
    .prepare(
      `UPDATE opted_in SET last_synced_at = ?
       WHERE farm_id IN (${placeholders})`,
    )
    .bind(at, ...farmIds)
    .run();
}
