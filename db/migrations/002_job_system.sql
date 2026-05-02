-- ============================================================
--  Migration 002 — Job Aggregation System
--  Safe to re-run: all IF NOT EXISTS / OR REPLACE
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/002_job_system.sql
-- ============================================================

-- Raw jobs from API providers (before AI filtering)
CREATE TABLE IF NOT EXISTS jobs_raw (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id   TEXT        NOT NULL UNIQUE,
  company_name  TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  location      TEXT        NOT NULL DEFAULT 'Remote',
  job_type      TEXT,
  description   TEXT,
  requirements  TEXT,
  salary_min    NUMERIC,
  salary_max    NUMERIC,
  salary_currency TEXT,
  posted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  apply_url     TEXT,
  source_api    TEXT        NOT NULL,
  dedup_hash    TEXT,
  is_duplicate  BOOLEAN     NOT NULL DEFAULT FALSE,
  raw_data      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_raw_dedup  ON jobs_raw (dedup_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_raw_posted ON jobs_raw (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_raw_dup    ON jobs_raw (is_duplicate) WHERE is_duplicate = FALSE;
CREATE INDEX IF NOT EXISTS idx_jobs_raw_source ON jobs_raw (source_api, created_at DESC);

-- Processed (AI-filtered) jobs
CREATE TABLE IF NOT EXISTS jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_raw_id      UUID        REFERENCES jobs_raw(id) ON DELETE SET NULL,
  external_id     TEXT        NOT NULL UNIQUE,
  company_name    TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  location        TEXT        NOT NULL DEFAULT 'Remote',
  job_type        TEXT,
  description     TEXT,
  requirements    TEXT,
  salary_min      NUMERIC,
  salary_max      NUMERIC,
  salary_currency TEXT,
  posted_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  apply_url       TEXT,
  source_api      TEXT,
  -- AI scoring
  relevance_score SMALLINT    NOT NULL DEFAULT 50,
  ai_decision     TEXT        NOT NULL DEFAULT 'REVIEW'
                              CHECK (ai_decision IN ('KEEP','REVIEW','DROP')),
  ai_reasoning    TEXT,
  tech_stack      TEXT[]      NOT NULL DEFAULT '{}',
  seniority_level TEXT,
  visa_sponsored  BOOLEAN,
  ai_model        TEXT,       -- 'claude-haiku-4-5' | 'pattern-v2'
  -- Status
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at      TIMESTAMPTZ,
  notified_at     TIMESTAMPTZ, -- set when included in a daily digest
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_active   ON jobs (is_active, relevance_score DESC)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_jobs_posted   ON jobs (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_decision ON jobs (ai_decision);
CREATE INDEX IF NOT EXISTS idx_jobs_tech     ON jobs USING GIN (tech_stack);
CREATE INDEX IF NOT EXISTS idx_jobs_fts      ON jobs USING GIN (
  to_tsvector('english', title || ' ' || COALESCE(description, ''))
);
CREATE INDEX IF NOT EXISTS idx_jobs_notified ON jobs (notified_at)
  WHERE notified_at IS NULL;

-- Job tags (searchable per-job keywords)
CREATE TABLE IF NOT EXISTS job_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tag        TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'tech',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_job_tags_tag ON job_tags (tag, category);

-- Ingestion run logs
CREATE TABLE IF NOT EXISTS job_ingestion_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_api      TEXT        NOT NULL,
  status          TEXT        NOT NULL CHECK (status IN ('SUCCESS','FAILED','PARTIAL')),
  jobs_fetched    INT         NOT NULL DEFAULT 0,
  jobs_new        INT         NOT NULL DEFAULT 0,
  jobs_duplicates INT         NOT NULL DEFAULT 0,
  jobs_filtered   INT         NOT NULL DEFAULT 0,
  error_message   TEXT,
  duration_ms     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingest_logs_created ON job_ingestion_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_logs_source  ON job_ingestion_logs (source_api, created_at DESC);

-- ── Single-user preferences (exactly one row) ─────────────────
-- The row always uses the fixed UUID '00000000-0000-0000-0000-000000000001'
-- so that the PUT /api/jobs/admin/preferences endpoint can use
-- ON CONFLICT (id) DO UPDATE reliably.
CREATE TABLE IF NOT EXISTS job_preferences (
  id                  UUID     PRIMARY KEY,
  desired_roles       TEXT[]   NOT NULL DEFAULT '{}',
  desired_locations   TEXT[]   NOT NULL DEFAULT '{Remote,France,EU,Europe}',
  min_salary          NUMERIC,
  required_tech_stack TEXT[]   NOT NULL DEFAULT '{}',
  avoid_tech_stack    TEXT[]   NOT NULL DEFAULT '{}',
  preferred_seniority TEXT[]   NOT NULL DEFAULT '{}',
  visa_requirement    TEXT,
  min_relevance_score SMALLINT NOT NULL DEFAULT 65,
  digest_email        TEXT,
  digest_time         TEXT     NOT NULL DEFAULT '08:15', -- HH:MM Europe/Paris
  excluded_companies  TEXT[]   NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Feedback table — your actions on each job ─────────────────
-- UNIQUE on job_id: exactly one feedback row per job.
-- Routes use ON CONFLICT (job_id) DO UPDATE for upsert.
CREATE TABLE IF NOT EXISTS job_feedback (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     UUID        NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  action     TEXT        NOT NULL CHECK (action IN ('applied','saved','skipped','hidden')),
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_feedback_action ON job_feedback (action, created_at DESC);

-- ── Auto-update triggers ──────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at_generic()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_generic();

CREATE OR REPLACE TRIGGER trg_job_prefs_updated_at
  BEFORE UPDATE ON job_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_generic();

-- ── Seed the single preferences row with a fixed UUID ────────
-- The fixed UUID matches PREFS_ID in routes/jobs.js.
-- ON CONFLICT DO NOTHING means this is safe to re-run.
INSERT INTO job_preferences (
  id,
  desired_roles,
  desired_locations,
  required_tech_stack,
  min_relevance_score,
  digest_time
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  ARRAY['DevOps','SRE','Cloud','Infrastructure','Platform','Kubernetes','Embedded'],
  ARRAY['Remote','France','EU','Europe','Germany','Netherlands'],
  ARRAY['Kubernetes','Docker','AWS','Terraform','Linux'],
  65,
  '08:15'
) ON CONFLICT (id) DO NOTHING;
