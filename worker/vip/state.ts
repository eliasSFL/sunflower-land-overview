/// <reference types="@cloudflare/workers-types" />

// D1 read/write helpers for the `vip` and `vip_payments` tables.
//
// The 3-day grace is encoded at read time: a farm is VIP while
// `expires_at + GRACE_MS > now`. Past raw expiry but inside grace =>
// `isVip=true, inGrace=true`. Notifications keep firing and the UI
// shows a renew banner.

import type { Env, VipChain } from "../types.ts";

export const TRIAL_DAYS = 30;
export const PERIOD_DAYS = 30;
export const GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_MS = TRIAL_DAYS * DAY_MS;
export const PERIOD_MS = PERIOD_DAYS * DAY_MS;
export const GRACE_MS = GRACE_DAYS * DAY_MS;

export type VipRow = {
  farm_id: number;
  expires_at: number | null;
  trial_used_at: number | null;
  paid_count: number;
  created_at: number;
  updated_at: number;
};

export type VipState = {
  farmId: number;
  expiresAt: number | null;
  trialUsedAt: number | null;
  isVip: boolean;
  inGrace: boolean;
  graceUntil: number | null;
};

function rowToState(farmId: number, row: VipRow | null, now: number): VipState {
  const expiresAt = row?.expires_at ?? null;
  const trialUsedAt = row?.trial_used_at ?? null;
  const graceUntil = expiresAt === null ? null : expiresAt + GRACE_MS;
  const isVip = graceUntil !== null && graceUntil > now;
  const inGrace = isVip && expiresAt !== null && expiresAt <= now;
  return { farmId, expiresAt, trialUsedAt, isVip, inGrace, graceUntil };
}

export async function readVip(env: Env, farmId: number): Promise<VipState> {
  const row = await env.sfl_overview_push
    .prepare(`SELECT * FROM vip WHERE farm_id = ?1`)
    .bind(farmId)
    .first<VipRow>();
  return rowToState(farmId, row, Date.now());
}

// Single D1 read used by the push gate. Returns true iff
// `expires_at + GRACE_MS > now`. Treats a missing row as "not VIP".
export async function isVipActive(env: Env, farmId: number): Promise<boolean> {
  const row = await env.sfl_overview_push
    .prepare(`SELECT expires_at FROM vip WHERE farm_id = ?1`)
    .bind(farmId)
    .first<{ expires_at: number | null }>();
  if (!row || row.expires_at === null) return false;
  return row.expires_at + GRACE_MS > Date.now();
}

// Idempotent trial claim. Returns `{ ok: true, state }` on success,
// `{ ok: false, reason: "trial_used" }` when the row already has a
// trial_used_at. The two-step INSERT-then-conditional-UPDATE is
// atomic in D1 (single SQLite engine, transactions per request).
export async function applyTrial(
  env: Env,
  farmId: number,
): Promise<
  | { ok: true; state: VipState }
  | { ok: false; reason: "trial_used"; state: VipState }
> {
  const now = Date.now();
  const newExpiry = now + TRIAL_MS;
  await env.sfl_overview_push
    .prepare(
      `INSERT INTO vip (farm_id, created_at, updated_at)
       VALUES (?1, ?2, ?2)
       ON CONFLICT(farm_id) DO NOTHING`,
    )
    .bind(farmId, now)
    .run();
  const update = await env.sfl_overview_push
    .prepare(
      `UPDATE vip
         SET trial_used_at = ?2,
             expires_at    = ?3,
             updated_at    = ?2
       WHERE farm_id = ?1
         AND trial_used_at IS NULL`,
    )
    .bind(farmId, now, newExpiry)
    .run();
  const state = await readVip(env, farmId);
  // D1's `meta.changes` is set by `.run()`. 0 changes ⇒ trial was
  // already used; the row was either pre-existing with a non-null
  // trial_used_at or another concurrent request beat us.
  const changed = (update.meta?.changes ?? 0) > 0;
  if (!changed) return { ok: false, reason: "trial_used", state };
  return { ok: true, state };
}

export type PaymentInsert = {
  farmId: number;
  chain: VipChain;
  txHash: string;
  from: string;
  to: string;
  amountUsdc6: bigint;
  blockNumber: bigint;
};

// Records a verified payment and bumps `expires_at` by PERIOD_MS from
// max(now, current expires_at). The UNIQUE(chain, tx_hash) constraint
// is the serialisation point for double-submit races: the second
// INSERT throws and we return `already_claimed`.
export async function applyPayment(
  env: Env,
  p: PaymentInsert,
): Promise<
  | { ok: true; state: VipState }
  | { ok: false; reason: "already_claimed"; state: VipState }
> {
  const now = Date.now();
  // Ensure the parent row exists so the payment + state update can
  // proceed without a FK or NULL surprise. ON CONFLICT keeps it
  // idempotent.
  await env.sfl_overview_push
    .prepare(
      `INSERT INTO vip (farm_id, created_at, updated_at)
       VALUES (?1, ?2, ?2)
       ON CONFLICT(farm_id) DO NOTHING`,
    )
    .bind(p.farmId, now)
    .run();
  const currentRow = await env.sfl_overview_push
    .prepare(`SELECT expires_at FROM vip WHERE farm_id = ?1`)
    .bind(p.farmId)
    .first<{ expires_at: number | null }>();
  const base = Math.max(now, currentRow?.expires_at ?? 0);
  const newExpiry = base + PERIOD_MS;
  try {
    await env.sfl_overview_push
      .batch([
        env.sfl_overview_push
          .prepare(
            `INSERT INTO vip_payments (
               farm_id, chain, tx_hash, from_address, to_address,
               amount_usdc_6, block_number, applied_at, extended_to
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
          )
          .bind(
            p.farmId,
            p.chain,
            p.txHash.toLowerCase(),
            p.from.toLowerCase(),
            p.to.toLowerCase(),
            // D1 INTEGER fits up to 2^63 - 1. 1 USDC = 1e6, so a 64-bit
            // signed int covers ~9.2 trillion USDC — way past anything
            // we'll see. Bigint converts cleanly through `Number()` for
            // values in this range.
            Number(p.amountUsdc6),
            Number(p.blockNumber),
            now,
            newExpiry,
          ),
        env.sfl_overview_push
          .prepare(
            `UPDATE vip
               SET expires_at = ?2,
                   paid_count = paid_count + 1,
                   updated_at = ?3
             WHERE farm_id = ?1`,
          )
          .bind(p.farmId, newExpiry, now),
      ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNIQUE/i.test(msg)) {
      const state = await readVip(env, p.farmId);
      return { ok: false, reason: "already_claimed", state };
    }
    throw err;
  }
  const state = await readVip(env, p.farmId);
  return { ok: true, state };
}
