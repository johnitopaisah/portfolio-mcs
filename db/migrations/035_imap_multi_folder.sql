-- ============================================================
--  Migration 035 — Professional (Zoho IMAP) mailbox: every folder
--
--  The worker used to read INBOX only and fetch "since the newest
--  received_at stored". Zoho files job-board mail into Notification /
--  Newsletter (and occasionally Spam), and one email with a future Date
--  header stalled the whole mailbox. It now:
--    • reads every folder except Sent/Drafts/Trash/Templates/Snoozed,
--    • tracks progress per folder by IMAP UID (imap_folder_state), so
--      clocks and Date headers no longer matter and mail moved between
--      folders (which receives a new UID) is still seen,
--    • de-duplicates on the RFC 5322 Message-ID (stable across moves),
--    • holds job-related mail from Spam for review on the dashboard.
--
--  Additive and idempotent. Safe to apply while the previous worker is
--  still running (it ignores the new columns).
--
--  Apply BEFORE deploying the new API image:
--    kubectl exec -n portfolio portfolio-db-0 -c postgres -i -- \
--      psql -U portfolio_user -d portfolio_db -v ON_ERROR_STOP=1 \
--      < db/migrations/035_imap_multi_folder.sql
-- ============================================================

BEGIN;

ALTER TABLE email_responses
  ADD COLUMN IF NOT EXISTS message_id          TEXT,
  ADD COLUMN IF NOT EXISTS imap_folder         TEXT,
  ADD COLUMN IF NOT EXISTS imap_uid            BIGINT,
  ADD COLUMN IF NOT EXISTS ai_suggested_status TEXT,
  -- NULL     = normal mail, shown and acted on immediately
  -- PENDING  = came from Spam; waits for the user before it is linked
  -- APPROVED = user kept it (then linked like any other email)
  -- REJECTED = user discarded it; hidden from the list
  ADD COLUMN IF NOT EXISTS review_status       TEXT;

DO $$ BEGIN
  ALTER TABLE email_responses
    ADD CONSTRAINT email_responses_review_status_check
    CHECK (review_status IS NULL OR review_status IN ('PENDING', 'APPROVED', 'REJECTED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per message per mailbox, whichever folder it was first seen in.
CREATE UNIQUE INDEX IF NOT EXISTS email_responses_source_msgid_key
  ON email_responses (source_account, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_responses_review_pending
  ON email_responses (received_at DESC)
  WHERE review_status = 'PENDING';

-- Per-folder high-water mark. last_uid is only advanced after the message
-- at that UID has been fully processed, so a dropped connection resumes
-- where it stopped. A changed uid_validity invalidates last_uid.
CREATE TABLE IF NOT EXISTS imap_folder_state (
  source_account TEXT        NOT NULL,
  folder         TEXT        NOT NULL,
  uid_validity   BIGINT      NOT NULL,
  last_uid       BIGINT      NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_account, folder)
);

-- Classification failures per message (Anthropic down / out of credit).
-- A folder stops at a failing message so it is retried next run; after
-- MAX_CLASSIFY_ATTEMPTS it is stored as UNKNOWN so it cannot block the folder.
CREATE TABLE IF NOT EXISTS imap_message_failures (
  source_account TEXT        NOT NULL,
  message_id     TEXT        NOT NULL,
  attempts       INTEGER     NOT NULL DEFAULT 1,
  last_error     TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_account, message_id)
);

-- Per-folder detail for the dashboard health badge, and PARTIAL status.
ALTER TABLE email_sync_logs
  ADD COLUMN IF NOT EXISTS details JSONB;

-- PARTIAL = some folders synced, at least one did not (see details).
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'email_sync_logs'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE email_sync_logs DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE email_sync_logs
  ADD CONSTRAINT email_sync_logs_status_check
  CHECK (status IN ('SUCCESS', 'PARTIAL', 'FAILED'));

-- Own notifications (portfolio digests, cluster alerts) are not recruitment
-- mail. The worker no longer stores them; remove any captured before the
-- new image rolls out. Idempotent.
DELETE FROM email_responses
WHERE source_account = 'imap'
  AND lower(sender_email) LIKE '%@johnisah.com';

COMMIT;
