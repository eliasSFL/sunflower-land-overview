// D1 reads/writes for the admin dashboard tables (system_banner,
// sweep_runs). Kept separate from worker/admin.ts so the route layer
// stays focused on auth + request shape and SQL stays in one place.

import type { SweepStats } from "./coordinator.ts";
import type { Env } from "./types.ts";

export type SweepRun = {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  trigger: "cron" | "manual";
  farmsTouched: number | null;
  farmsSkipped: number | null;
  errors: string | null;
};

// Wraps a `sweep()` call so that every run leaves a `sweep_runs` row,
// regardless of outcome. The row is INSERTed before the sweep starts
// (so an in-flight UI can see it) and UPDATEd on completion / crash.
// Returns the stats from sweep() for callers that want them; logs and
// swallows errors so a failing D1 write doesn't break the sweep itself.
export async function runAndRecordSweep(
  env: Env,
  trigger: "cron" | "manual",
  fn: (env: Env) => Promise<SweepStats>,
): Promise<SweepStats | { skipped: true }> {
  const id = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    await env.sfl_overview_push
      .prepare(
        `INSERT INTO sweep_runs (id, started_at, trigger) VALUES (?1, ?2, ?3)`,
      )
      .bind(id, startedAt, trigger)
      .run();
  } catch (err) {
    console.warn("sweep_runs insert failed:", err);
  }

  try {
    const stats = await fn(env);
    if (stats.skipped) {
      // Another sweep was already in flight; delete the row we just
      // inserted so the dashboard doesn't show a phantom zero-progress
      // run alongside the real one.
      try {
        await env.sfl_overview_push
          .prepare(`DELETE FROM sweep_runs WHERE id = ?1`)
          .bind(id)
          .run();
      } catch (err) {
        console.warn("sweep_runs delete (skip path) failed:", err);
      }
      return { skipped: true };
    }
    try {
      await env.sfl_overview_push
        .prepare(
          `UPDATE sweep_runs SET finished_at = ?1, farms_touched = ?2, farms_skipped = ?3 WHERE id = ?4`,
        )
        .bind(Date.now(), stats.synced, stats.skippedUpstream, id)
        .run();
    } catch (err) {
      console.warn("sweep_runs update failed:", err);
    }
    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await env.sfl_overview_push
        .prepare(
          `UPDATE sweep_runs SET finished_at = ?1, errors = ?2 WHERE id = ?3`,
        )
        .bind(Date.now(), message, id)
        .run();
    } catch (writeErr) {
      console.warn("sweep_runs error-update failed:", writeErr);
    }
    throw err;
  }
}

export async function listSweepRuns(
  env: Env,
  limit: number,
): Promise<SweepRun[]> {
  const res = await env.sfl_overview_push
    .prepare(
      `SELECT id, started_at, finished_at, trigger, farms_touched, farms_skipped, errors
       FROM sweep_runs ORDER BY started_at DESC LIMIT ?1`,
    )
    .bind(limit)
    .all<{
      id: string;
      started_at: number;
      finished_at: number | null;
      trigger: string;
      farms_touched: number | null;
      farms_skipped: number | null;
      errors: string | null;
    }>();
  return (res.results ?? []).map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    trigger: r.trigger === "manual" ? "manual" : "cron",
    farmsTouched: r.farms_touched,
    farmsSkipped: r.farms_skipped,
    errors: r.errors,
  }));
}

export async function getBanner(
  env: Env,
): Promise<{ text: string; updatedAt: number } | null> {
  const row = await env.sfl_overview_push
    .prepare(`SELECT text, updated_at FROM system_banner WHERE id = 1`)
    .first<{ text: string; updated_at: number }>();
  if (!row) return null;
  return { text: row.text, updatedAt: row.updated_at };
}

export async function setBanner(env: Env, text: string): Promise<void> {
  await env.sfl_overview_push
    .prepare(
      `INSERT INTO system_banner (id, text, updated_at) VALUES (1, ?1, ?2)
       ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    )
    .bind(text, Date.now())
    .run();
}

export async function clearBanner(env: Env): Promise<void> {
  await env.sfl_overview_push
    .prepare(`DELETE FROM system_banner WHERE id = 1`)
    .run();
}

export async function countOptedInFarms(env: Env): Promise<number> {
  const row = await env.sfl_overview_push
    .prepare(`SELECT COUNT(*) AS n FROM opted_in`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
