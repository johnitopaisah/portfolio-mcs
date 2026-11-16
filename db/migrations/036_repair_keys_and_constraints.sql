-- ============================================================
--  Migration 036 — Repair: data fixes + missing keys and constraints
--
--  Production lost 38 constraints and 55 indexes that the schema
--  defines (most likely a partial restore during the Sep 2026 GCP move):
--  every column exists, but 20 tables had no primary key. This file
--  restores the constraints; 037 restores the indexes concurrently.
--
--  Generated from a diff of db/schema.sql + db/migrations (the intended
--  schema) against production, then reviewed. Every statement is guarded,
--  so it is a no-op on a database that already has the object (fresh
--  installs, re-runs).
--
--  Runs in ONE transaction (the runner wraps it): if any constraint fails
--  to validate, nothing changes and the rollout stops.
--
--  visitor_logs' primary key (490k rows) is built concurrently in 037.
-- ============================================================

-- ── Data fixes (rows that would violate the restored constraints) ─────

-- base_cv_versions: v1 (May) and v2 (June) both ended up with id 1.
-- v2 gets the next id; documents created after v2 existed move with it
-- (17 documents from 20 May – 6 Jun stay on v1, 6 from 20 Jun follow v2).
WITH moved AS (
  UPDATE base_cv_versions
  SET id = nextval(pg_get_serial_sequence('base_cv_versions', 'id'))
  WHERE id = 1 AND version = 2
    AND (SELECT count(*) FROM base_cv_versions WHERE id = 1) > 1
  RETURNING id, created_at
)
UPDATE application_documents d
SET base_cv_version = moved.id
FROM moved
WHERE d.base_cv_version = 1 AND d.created_at >= moved.created_at;

-- applications pointing at jobs that no longer exist: what the restored
-- ON DELETE SET NULL would have done.
UPDATE applications a SET job_id = NULL
WHERE a.job_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = a.job_id);

-- job_feedback for jobs that no longer exist: what ON DELETE CASCADE would have done.
DELETE FROM job_feedback f
WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.id = f.job_id);

-- ── Primary keys ────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.admin_user'::regclass AND contype = 'p') THEN
    ALTER TABLE public.admin_user ADD CONSTRAINT admin_user_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.application_events'::regclass AND contype = 'p') THEN
    ALTER TABLE public.application_events ADD CONSTRAINT application_events_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.base_cv_versions'::regclass AND contype = 'p') THEN
    ALTER TABLE public.base_cv_versions ADD CONSTRAINT base_cv_versions_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.certifications'::regclass AND contype = 'p') THEN
    ALTER TABLE public.certifications ADD CONSTRAINT certifications_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.companies'::regclass AND contype = 'p') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.contact_messages'::regclass AND contype = 'p') THEN
    ALTER TABLE public.contact_messages ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.education'::regclass AND contype = 'p') THEN
    ALTER TABLE public.education ADD CONSTRAINT education_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.email_responses'::regclass AND contype = 'p') THEN
    ALTER TABLE public.email_responses ADD CONSTRAINT email_responses_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.experiences'::regclass AND contype = 'p') THEN
    ALTER TABLE public.experiences ADD CONSTRAINT experiences_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.job_ingestion_logs'::regclass AND contype = 'p') THEN
    ALTER TABLE public.job_ingestion_logs ADD CONSTRAINT job_ingestion_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.notification_log'::regclass AND contype = 'p') THEN
    ALTER TABLE public.notification_log ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.password_reset_tokens'::regclass AND contype = 'p') THEN
    ALTER TABLE public.password_reset_tokens ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profile'::regclass AND contype = 'p') THEN
    ALTER TABLE public.profile ADD CONSTRAINT profile_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.project_images'::regclass AND contype = 'p') THEN
    ALTER TABLE public.project_images ADD CONSTRAINT project_images_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.projects'::regclass AND contype = 'p') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.referee_contact_requests'::regclass AND contype = 'p') THEN
    ALTER TABLE public.referee_contact_requests ADD CONSTRAINT referee_contact_requests_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.referee_invitations'::regclass AND contype = 'p') THEN
    ALTER TABLE public.referee_invitations ADD CONSTRAINT referee_invitations_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.skills'::regclass AND contype = 'p') THEN
    ALTER TABLE public.skills ADD CONSTRAINT skills_pkey PRIMARY KEY (id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.social_links'::regclass AND contype = 'p') THEN
    ALTER TABLE public.social_links ADD CONSTRAINT social_links_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- ── Unique constraints ──────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.admin_user'::regclass AND conname = 'admin_user_username_key') THEN
    ALTER TABLE public.admin_user ADD CONSTRAINT admin_user_username_key UNIQUE (username);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.companies'::regclass AND conname = 'companies_external_id_key') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_external_id_key UNIQUE (external_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.password_reset_tokens'::regclass AND conname = 'password_reset_tokens_token_key') THEN
    ALTER TABLE public.password_reset_tokens ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.referee_contact_requests'::regclass AND conname = 'referee_contact_requests_consent_token_key') THEN
    ALTER TABLE public.referee_contact_requests ADD CONSTRAINT referee_contact_requests_consent_token_key UNIQUE (consent_token);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.referee_contact_requests'::regclass AND conname = 'referee_contact_requests_verification_token_key') THEN
    ALTER TABLE public.referee_contact_requests ADD CONSTRAINT referee_contact_requests_verification_token_key UNIQUE (verification_token);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.referee_invitations'::regclass AND conname = 'referee_invitations_token_key') THEN
    ALTER TABLE public.referee_invitations ADD CONSTRAINT referee_invitations_token_key UNIQUE (token);
  END IF;
END $$;

-- ── Check constraints ───────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.email_templates'::regclass AND conname = 'email_templates_category_check') THEN
    ALTER TABLE public.email_templates ADD CONSTRAINT email_templates_category_check CHECK (((category)::text = ANY ((ARRAY['follow_up'::character varying, 'thank_you'::character varying, 'withdrawal'::character varying, 'negotiation'::character varying, 'rejection_feedback'::character varying, 'timeline_request'::character varying, 'reconnect'::character varying, 'general'::character varying])::text[])));
  END IF;
END $$;

-- ── Foreign keys ────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.application_documents'::regclass AND conname = 'application_documents_application_id_fkey') THEN
    ALTER TABLE public.application_documents ADD CONSTRAINT application_documents_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.application_documents'::regclass AND conname = 'application_documents_base_cv_version_fkey') THEN
    ALTER TABLE public.application_documents ADD CONSTRAINT application_documents_base_cv_version_fkey FOREIGN KEY (base_cv_version) REFERENCES base_cv_versions(id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.application_events'::regclass AND conname = 'application_events_application_id_fkey') THEN
    ALTER TABLE public.application_events ADD CONSTRAINT application_events_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.applications'::regclass AND conname = 'applications_job_id_fkey') THEN
    ALTER TABLE public.applications ADD CONSTRAINT applications_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.email_responses'::regclass AND conname = 'email_responses_application_id_fkey') THEN
    ALTER TABLE public.email_responses ADD CONSTRAINT email_responses_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.job_feedback'::regclass AND conname = 'job_feedback_job_id_fkey') THEN
    ALTER TABLE public.job_feedback ADD CONSTRAINT job_feedback_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_job_raw_id_fkey') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_raw_id_fkey FOREIGN KEY (job_raw_id) REFERENCES jobs_raw(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs_raw'::regclass AND conname = 'jobs_raw_company_id_fkey') THEN
    ALTER TABLE public.jobs_raw ADD CONSTRAINT jobs_raw_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.project_images'::regclass AND conname = 'project_images_project_id_fkey') THEN
    ALTER TABLE public.project_images ADD CONSTRAINT project_images_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.referee_contact_requests'::regclass AND conname = 'referee_contact_requests_referee_id_fkey') THEN
    ALTER TABLE public.referee_contact_requests ADD CONSTRAINT referee_contact_requests_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES referees(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.referee_invitations'::regclass AND conname = 'referee_invitations_referee_id_fkey') THEN
    ALTER TABLE public.referee_invitations ADD CONSTRAINT referee_invitations_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES referees(id) ON DELETE SET NULL;
  END IF;
END $$;
