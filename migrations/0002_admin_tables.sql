-- Admin dashboard tables.
--
-- `system_banner` — at most one row at any time (enforced by `id = 1`).
-- The SPA polls `GET /api/banner` and renders the text across the top
-- of the dashboard for every visitor; empty/missing row = no banner.
--
-- `sweep_runs` — one row per coordinator sweep, written by both the
-- cron-triggered scheduled() handler and the manual /api/admin/sweep
-- endpoint. Powers the "is the cron still alive / how big was the
-- last sweep" view in the admin stats panel. `finished_at` is null
-- while the sweep is in flight; `errors` is a stringified message
-- only on crash so the happy path stays compact.

CREATE TABLE IF NOT EXISTS system_banner (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  text        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sweep_runs (
  id             TEXT PRIMARY KEY,
  started_at     INTEGER NOT NULL,
  finished_at    INTEGER,
  trigger        TEXT NOT NULL,
  farms_touched  INTEGER,
  farms_skipped  INTEGER,
  errors         TEXT
);

CREATE INDEX IF NOT EXISTS idx_sweep_runs_started ON sweep_runs (started_at DESC);
