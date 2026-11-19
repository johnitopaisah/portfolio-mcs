-- ============================================================
--  Migration 039 — Recruiter outbox (approve before send), application
--  context for AI prep, and notification preferences that actually save.
--
--  Additive and idempotent.
-- ============================================================

-- ── Application context (Interview tab → "Application context") ──
-- What the AI uses for interview questions / prep checklist / follow-up
-- drafts when the application has no scraped job (e.g. email-detected).
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS context_cv_source        TEXT,   -- 'document:<id>' | 'base:<id>' | 'upload:<document id>'
  ADD COLUMN IF NOT EXISTS context_cv_text          TEXT,   -- plain text of that CV (≤ 20 000 chars)
  ADD COLUMN IF NOT EXISTS context_job_description  TEXT;   -- pasted job ad (≤ 20 000 chars)

-- ── Notification preferences (Goals → Notification Preferences) ──
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS preferred_reminder_channel TEXT NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS digest_schedule            TEXT NOT NULL DEFAULT 'daily';

DO $$ BEGIN
  ALTER TABLE user_settings ADD CONSTRAINT user_settings_reminder_channel_check
    CHECK (preferred_reminder_channel IN ('email', 'in_app'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE user_settings ADD CONSTRAINT user_settings_digest_schedule_check
    CHECK (digest_schedule IN ('daily', 'weekly', 'off'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Outbox: emails to recruiters, sent only after approval ──────
--  draft            → no recipient yet / not yet submitted for approval
--  pending_approval → waiting for you (approval email and/or Outbox page)
--  approved         → will send at send_after (5-min undo, working hours)
--  sending          → being sent right now (guards against double-send)
--  sent | failed | skipped | expired | cancelled  → final
CREATE TABLE IF NOT EXISTS outbound_emails (
  id                    SERIAL PRIMARY KEY,
  application_id        INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  source                TEXT    NOT NULL,                 -- 'follow_up_rule' | 'manual'
  status                TEXT    NOT NULL DEFAULT 'draft',
  to_email              TEXT,
  to_name               TEXT,
  subject               TEXT    NOT NULL,
  body                  TEXT    NOT NULL,
  in_reply_to           TEXT,                             -- Message-ID of the recruiter email we reply to
  references_header     TEXT,
  reply_to_response_id  INTEGER REFERENCES email_responses(id) ON DELETE SET NULL,
  template_id           INTEGER,
  ai_polished           BOOLEAN NOT NULL DEFAULT FALSE,
  version               INTEGER NOT NULL DEFAULT 1,       -- bumped on every edit
  approval_token_hash   TEXT,                             -- sha256 of the emailed one-time token
  approval_token_version INTEGER,                         -- token only valid for this version
  approval_expires_at   TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  approved_via          TEXT,                             -- 'email' | 'dashboard'
  send_after            TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  message_id            TEXT,
  attempts              INTEGER NOT NULL DEFAULT 0,
  last_error            TEXT,
  cancel_reason         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT outbound_emails_status_check CHECK (status IN
    ('draft', 'pending_approval', 'approved', 'sending', 'sent', 'failed', 'skipped', 'expired', 'cancelled')),
  CONSTRAINT outbound_emails_source_check CHECK (source IN ('follow_up_rule', 'manual'))
);

-- At most one open automatic follow-up per application.
CREATE UNIQUE INDEX IF NOT EXISTS outbound_emails_one_open_followup
  ON outbound_emails (application_id)
  WHERE source = 'follow_up_rule' AND status IN ('draft', 'pending_approval', 'approved', 'sending');

CREATE INDEX IF NOT EXISTS idx_outbound_emails_status_send
  ON outbound_emails (status, send_after);
CREATE INDEX IF NOT EXISTS idx_outbound_emails_application
  ON outbound_emails (application_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS outbound_emails_token_key
  ON outbound_emails (approval_token_hash) WHERE approval_token_hash IS NOT NULL;

-- Permanent audit trail: nothing here is ever updated or deleted by the app.
CREATE TABLE IF NOT EXISTS outbound_email_events (
  id                 BIGSERIAL PRIMARY KEY,
  outbound_email_id  INTEGER NOT NULL REFERENCES outbound_emails(id) ON DELETE CASCADE,
  event              TEXT    NOT NULL,   -- created|edited|ai_polished|approval_requested|approved|undone|skipped|sent|failed|cancelled|expired
  actor              TEXT    NOT NULL,   -- 'system' | 'you'
  detail             JSONB   NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_outbound_email_events_email
  ON outbound_email_events (outbound_email_id, created_at);
