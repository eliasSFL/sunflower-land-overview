-- D1 registry of farms that have opted in to push notifications. The
-- Coordinator (worker/coordinator.ts) builds an in-memory Set from this
-- table at the start of every cron sweep and filters paginated upstream
-- farm responses against it.

CREATE TABLE IF NOT EXISTS opted_in (
  farm_id        INTEGER PRIMARY KEY,
  subscribed_at  INTEGER NOT NULL,
  last_synced_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_opted_in_synced ON opted_in (last_synced_at);
