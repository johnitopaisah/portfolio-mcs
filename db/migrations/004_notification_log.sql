-- ============================================================
--  Migration 004 — Notification deduplication log
--  Prevents the same alert/digest being sent twice in one window.
--  Safe to re-run: all IF NOT EXISTS
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/004_notification_log.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel    TEXT        NOT NULL,   -- 'email' | 'telegram'
  alert_key  TEXT        NOT NULL,   -- e.g. 'job_digest:2026-05-06'
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, alert_key)
);

CREATE INDEX IF NOT EXISTS idx_notif_log_key_sent
  ON notification_log (alert_key, sent_at DESC);