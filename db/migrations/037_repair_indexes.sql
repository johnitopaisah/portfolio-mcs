-- migrate:no-transaction
-- ============================================================
--  Migration 037 — Repair: restore missing indexes (concurrently)
--
--  Companion to 036. CREATE INDEX CONCURRENTLY does not block reads or
--  writes, but cannot run in a transaction — the runner sends this file
--  one statement at a time. Every statement is re-runnable: if the run is
--  interrupted, the next rollout continues where it stopped.
--
--  41 indexes restored. Left out on purpose (14):
--    idx_companies_external_id — redundant with unique/primary key on companies(external_id)
--    idx_jobs_raw_dedup_hash — identical to idx_jobs_raw_dedup
--    idx_jobs_raw_external_id — redundant with unique/primary key on jobs_raw(external_id)
--    idx_jobs_raw_is_duplicate — identical to idx_jobs_raw_dup
--    idx_jobs_raw_posted_at — identical to idx_jobs_raw_posted
--    idx_jobs_external_id — redundant with unique/primary key on jobs(external_id)
--    idx_jobs_fts — expression never used by queries (jobs.js uses title || ' ' || description → idx_jobs_title_tsvector)
--    idx_jobs_posted_at — identical to idx_jobs_posted
--    idx_reset_token — redundant with unique/primary key on password_reset_tokens(token)
--    idx_project_images_proj — identical to idx_project_images_project
--    idx_rcr_consent_token — redundant with unique/primary key on referee_contact_requests(consent_token)
--    idx_rcr_verification_token — redundant with unique/primary key on referee_contact_requests(verification_token)
--    referee_invitations_token_idx — redundant with unique/primary key on referee_invitations(token)
--    idx_visitor_not_bot — identical to idx_visitor_is_bot
-- ============================================================

-- An interrupted CONCURRENTLY build leaves an INVALID index behind that
-- IF NOT EXISTS would then skip. Drop any such leftovers first.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT i.indisvalid
      AND c.relname IN ('visitor_logs_pkey', 'idx_app_docs_application_id', 'idx_app_events_application_id', 'idx_applications_job_id', 'idx_applications_status', 'idx_certs_order', 'idx_companies_name', 'idx_messages_unread', 'idx_job_feedback_action', 'idx_job_feedback_created_at', 'idx_job_feedback_decision', 'idx_ingest_logs_created', 'idx_ingest_logs_source', 'idx_ingestion_logs_source_api', 'idx_jobs_active', 'idx_jobs_active_score', 'idx_jobs_decision', 'idx_jobs_is_active', 'idx_jobs_location', 'idx_jobs_notified', 'idx_jobs_posted', 'idx_jobs_relevance_score', 'idx_jobs_tech', 'idx_jobs_title_tsvector', 'idx_jobs_raw_company_id', 'idx_jobs_raw_dedup', 'idx_jobs_raw_dup', 'idx_jobs_raw_posted', 'idx_jobs_raw_source', 'idx_notif_log_key_sent', 'idx_project_images_project', 'idx_projects_featured', 'idx_projects_published', 'idx_rcr_consent_reminder', 'idx_rcr_created_at', 'idx_rcr_referee_id', 'idx_rcr_status', 'idx_skills_category', 'idx_visitor_country', 'idx_visitor_is_bot', 'idx_visitor_session', 'idx_visitor_visited_at')
  LOOP
    EXECUTE format('DROP INDEX public.%I', r.relname);
  END LOOP;
END $$;

-- ── visitor_logs primary key (~490k rows) ─────────────────────
-- Build the unique index without blocking writes, then attach it as the
-- primary key (a short lock to check id is NOT NULL).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS visitor_logs_pkey ON public.visitor_logs USING btree (id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.visitor_logs'::regclass AND contype = 'p') THEN
    ALTER TABLE public.visitor_logs ADD CONSTRAINT visitor_logs_pkey PRIMARY KEY USING INDEX visitor_logs_pkey;
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────
-- application_documents
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_docs_application_id ON public.application_documents USING btree (application_id);

-- application_events
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_events_application_id ON public.application_events USING btree (application_id);

-- applications
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_job_id ON public.applications USING btree (job_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_applications_status ON public.applications USING btree (status);

-- certifications
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_certs_order ON public.certifications USING btree (order_index, issue_date DESC);

-- companies
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_name ON public.companies USING btree (name);

-- contact_messages
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_unread ON public.contact_messages USING btree (read, created_at DESC);

-- job_feedback
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_feedback_action ON public.job_feedback USING btree (decision, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_feedback_created_at ON public.job_feedback USING btree (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_feedback_decision ON public.job_feedback USING btree (decision);

-- job_ingestion_logs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingest_logs_created ON public.job_ingestion_logs USING btree (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingest_logs_source ON public.job_ingestion_logs USING btree (source_api, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ingestion_logs_source_api ON public.job_ingestion_logs USING btree (source_api, started_at DESC);

-- jobs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_active ON public.jobs USING btree (is_active, relevance_score DESC) WHERE (is_active = true);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_active_score ON public.jobs USING btree (relevance_score DESC, posted_at DESC) WHERE ((is_active = true) AND (ai_decision <> 'DROP'::text));
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_decision ON public.jobs USING btree (ai_decision);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_is_active ON public.jobs USING btree (is_active) WHERE (is_active = true);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_location ON public.jobs USING btree (location);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_notified ON public.jobs USING btree (notified_at) WHERE (notified_at IS NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_posted ON public.jobs USING btree (posted_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_relevance_score ON public.jobs USING btree (relevance_score DESC) WHERE (is_active = true);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_tech ON public.jobs USING gin (tech_stack);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_title_tsvector ON public.jobs USING gin (to_tsvector('english'::regconfig, ((title || ' '::text) || description)));

-- jobs_raw
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_raw_company_id ON public.jobs_raw USING btree (company_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_raw_dedup ON public.jobs_raw USING btree (dedup_hash);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_raw_dup ON public.jobs_raw USING btree (is_duplicate) WHERE (is_duplicate = false);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_raw_posted ON public.jobs_raw USING btree (posted_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_raw_source ON public.jobs_raw USING btree (source_api, created_at DESC);

-- notification_log
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_log_key_sent ON public.notification_log USING btree (alert_key, sent_at DESC);

-- project_images
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_images_project ON public.project_images USING btree (project_id, order_index);

-- projects
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_featured ON public.projects USING btree (featured) WHERE (featured = true);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_published ON public.projects USING btree (published, order_index);

-- referee_contact_requests
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rcr_consent_reminder ON public.referee_contact_requests USING btree (status, consent_last_reminded_at) WHERE (status = 'consent_requested'::text);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rcr_created_at ON public.referee_contact_requests USING btree (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rcr_referee_id ON public.referee_contact_requests USING btree (referee_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rcr_status ON public.referee_contact_requests USING btree (status);

-- skills
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_skills_category ON public.skills USING btree (category, order_index);

-- visitor_logs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitor_country ON public.visitor_logs USING btree (country_code);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitor_is_bot ON public.visitor_logs USING btree (is_bot) WHERE (is_bot = false);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitor_session ON public.visitor_logs USING btree (session_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitor_visited_at ON public.visitor_logs USING btree (visited_at DESC);
