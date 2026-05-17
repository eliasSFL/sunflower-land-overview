-- VIP subscription state for the notifications feature.
--
-- `vip` is the single row consulted by every gating check. A farm is
-- VIP iff `expires_at IS NOT NULL AND expires_at + 3*86400_000 > now`.
-- The 3-day grace is read-side only; `expires_at` itself stays
-- immutable so renewal math (`max(now, expires_at) + 30d`) is clean.
--
-- `vip_payments` is the immutable ledger backing every paid extension.
-- UNIQUE(chain, tx_hash) serialises double-submit races (winner inserts,
-- loser hits the constraint and we return `already_claimed`).

CREATE TABLE IF NOT EXISTS vip (
  farm_id        INTEGER PRIMARY KEY,
  expires_at     INTEGER,
  trial_used_at  INTEGER,
  paid_count     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vip_expires ON vip (expires_at);

CREATE TABLE IF NOT EXISTS vip_payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id        INTEGER NOT NULL,
  chain          TEXT NOT NULL,
  tx_hash        TEXT NOT NULL,
  from_address   TEXT NOT NULL,
  to_address     TEXT NOT NULL,
  amount_usdc_6  INTEGER NOT NULL,
  block_number   INTEGER NOT NULL,
  applied_at     INTEGER NOT NULL,
  extended_to    INTEGER NOT NULL,
  UNIQUE (chain, tx_hash)
);

CREATE INDEX IF NOT EXISTS idx_vip_payments_farm ON vip_payments (farm_id);
