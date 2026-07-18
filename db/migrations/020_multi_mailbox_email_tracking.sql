-- 020_multi_mailbox_email_tracking.sql
-- Adds support for tracking application replies across multiple mailboxes
-- (Gmail + a second professional-domain inbox via IMAP), plus the
-- filter/feedback/sync-health infrastructure needed for the dashboard.

-- ── 1. Tag each email with which mailbox it arrived in ──────────────
ALTER TABLE email_responses
  ADD COLUMN IF NOT EXISTS source_account TEXT NOT NULL DEFAULT 'gmail';

-- Classification feedback (thumbs up/down on AI accuracy)
ALTER TABLE email_responses
  ADD COLUMN IF NOT EXISTS reviewed_correct BOOLEAN,
  ADD COLUMN IF NOT EXISTS corrected_classification TEXT;

-- ── 2. Dedup key must be source-aware ────────────────────────────────
-- Gmail message IDs and IMAP UIDs come from different ID spaces — a
-- bare UNIQUE on gmail_message_id risks a false "duplicate" if an IMAP
-- UID happens to collide with a Gmail ID string. Drop the single-column
-- uniqueness and replace with a composite one. Existing rows default to
-- source_account='gmail', so this is safe to apply with data present.
ALTER TABLE email_responses DROP CONSTRAINT IF EXISTS email_responses_gmail_message_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS email_responses_source_message_key
  ON email_responses (source_account, gmail_message_id);

CREATE INDEX IF NOT EXISTS idx_email_responses_source ON email_responses(source_account);

-- ── 3. Per-mailbox sync health (mirrors job_ingestion_logs) ─────────
CREATE TABLE IF NOT EXISTS email_sync_logs (
  id              SERIAL      PRIMARY KEY,
  source_account  TEXT        NOT NULL,
  status          TEXT        NOT NULL CHECK (status IN ('SUCCESS','FAILED')),
  emails_fetched  INT         NOT NULL DEFAULT 0,
  emails_new      INT         NOT NULL DEFAULT 0,
  error_message   TEXT,
  duration_ms     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_sync_logs_source_created
  ON email_sync_logs (source_account, created_at DESC);
