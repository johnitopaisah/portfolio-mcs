-- 017_job_import_tracking.sql
-- Adds manual job import, application intelligence fields,
-- contacts/reminders tables, and expanded status pipeline.

-- ── 1. Extend jobs table ────────────────────────────────────────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS entry_method        text    DEFAULT 'scraper',
  ADD COLUMN IF NOT EXISTS raw_text            text,
  ADD COLUMN IF NOT EXISTS source_url          text,
  ADD COLUMN IF NOT EXISTS role_summary        text,
  ADD COLUMN IF NOT EXISTS red_flags           text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_skills     text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS nice_to_have        text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS soft_skills         text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS certifications_req  text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS languages_required  text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS company_stage       text,
  ADD COLUMN IF NOT EXISTS team_size_hint      text,
  ADD COLUMN IF NOT EXISTS reporting_to        text,
  ADD COLUMN IF NOT EXISTS work_arrangement    text;

-- ── 1b. Safety guards: some environments are missing PKs/unique indexes
--       that later ON CONFLICT / FK clauses in this migration depend on.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'application_documents'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE application_documents ADD PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'applications'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE applications ADD PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'referees'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE referees ADD PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'jobs'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE jobs ADD PRIMARY KEY (id);
  END IF;
END $$;

-- jobIngestionService/aiFilteringService rely on ON CONFLICT (external_id)
-- and ON CONFLICT (channel, alert_key) — these never had backing unique
-- indexes in some environments, causing every insert to fail.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_external_id_key
  ON jobs(external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notification_log_channel_alert_key
  ON notification_log(channel, alert_key);

-- ── 2. Extend applications table ───────────────────────────────
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS source_url          text,
  ADD COLUMN IF NOT EXISTS entry_method        text    DEFAULT 'scraper',
  ADD COLUMN IF NOT EXISTS matched_skills      text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS missing_skills      text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS strongest_angle     text,
  ADD COLUMN IF NOT EXISTS cover_letter_hook   text,
  ADD COLUMN IF NOT EXISTS suggested_hints     text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS suggested_sections  text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS follow_up_at        timestamptz,
  ADD COLUMN IF NOT EXISTS interview_at        timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_doc_id    integer REFERENCES application_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason    text,
  ADD COLUMN IF NOT EXISTS referral_from       text,
  ADD COLUMN IF NOT EXISTS interview_prep      jsonb   DEFAULT '{}';

-- ── 3. application_contacts ────────────────────────────────────
CREATE TABLE IF NOT EXISTS application_contacts (
  id             serial      PRIMARY KEY,
  application_id integer     NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  title          text,
  email          text,
  linkedin_url   text,
  role           text        DEFAULT 'recruiter',
  notes          text,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_contacts_app_id ON application_contacts(application_id);

-- ── 4. application_reminders ───────────────────────────────────
CREATE TABLE IF NOT EXISTS application_reminders (
  id             serial      PRIMARY KEY,
  application_id integer     NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  reminder_type  text        NOT NULL DEFAULT 'custom',
  title          text        NOT NULL,
  remind_at      timestamptz NOT NULL,
  is_done        boolean     DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_reminders_app_id  ON application_reminders(application_id);
CREATE INDEX IF NOT EXISTS idx_app_reminders_due     ON application_reminders(remind_at) WHERE is_done = false;
