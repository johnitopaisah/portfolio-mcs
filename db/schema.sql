-- ============================================================
--  Portfolio MCS — Master Schema
--  Auto-runs on first container start via docker-entrypoint-initdb.d
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- profile (single row)
CREATE TABLE IF NOT EXISTS profile (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  headline            TEXT        NOT NULL,
  bio                 TEXT        NOT NULL,
  avatar              BYTEA,
  avatar_mime         TEXT,
  resume              BYTEA,
  resume_mime         TEXT,
  resume_en           BYTEA,
  resume_en_mime      TEXT,
  resume_fr           BYTEA,
  resume_fr_mime      TEXT,
  github_url          TEXT,
  linkedin_url        TEXT,
  email               TEXT        NOT NULL,
  hero_tags           TEXT[]      NOT NULL DEFAULT '{}',
  availability_status TEXT        NOT NULL DEFAULT 'active'
                        CONSTRAINT availability_status_check
                          CHECK (availability_status IN ('active','passive','not_open')),
  orbit_badge_ids     TEXT[]      NOT NULL DEFAULT '{}',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- projects
CREATE TABLE IF NOT EXISTS projects (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT        NOT NULL,
  description   TEXT        NOT NULL,
  tech_stack    TEXT[]      NOT NULL DEFAULT '{}',
  live_url      TEXT,
  repo_url      TEXT,
  image         BYTEA,
  image_mime    TEXT,
  featured      BOOLEAN     NOT NULL DEFAULT FALSE,
  published     BOOLEAN     NOT NULL DEFAULT FALSE,
  order_index   INT         NOT NULL DEFAULT 0,
  start_date    DATE,
  end_date      DATE,
  ongoing       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- project_images — multiple demo/slideshow images per project
CREATE TABLE IF NOT EXISTS project_images (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  image         BYTEA       NOT NULL,
  image_mime    TEXT        NOT NULL DEFAULT 'image/jpeg',
  caption       TEXT,
  order_index   INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- skills
CREATE TABLE IF NOT EXISTS skills (
  id            UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT     NOT NULL,
  category      TEXT     NOT NULL,
  proficiency   SMALLINT NOT NULL CHECK (proficiency BETWEEN 1 AND 5),
  icon          BYTEA,
  icon_mime     TEXT,
  order_index   INT      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- experiences
CREATE TABLE IF NOT EXISTS experiences (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company       TEXT        NOT NULL,
  role          TEXT        NOT NULL,
  description   TEXT        NOT NULL,
  start_date    DATE        NOT NULL,
  end_date      DATE,
  ongoing       BOOLEAN     NOT NULL DEFAULT FALSE,
  tech_stack    TEXT[]      NOT NULL DEFAULT '{}',
  logo          BYTEA,
  logo_mime     TEXT,
  order_index   INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- certifications
CREATE TABLE IF NOT EXISTS certifications (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  issuer         TEXT        NOT NULL,
  issue_date     DATE        NOT NULL,
  expiry_date    DATE,
  credential_id  TEXT,
  credential_url TEXT,
  image          BYTEA,
  image_mime     TEXT,
  order_index    INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- social_links — dynamic contact/social links shown on the portfolio
CREATE TABLE IF NOT EXISTS social_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform    TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  order_index INTEGER     NOT NULL DEFAULT 0,
  visible     BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- contact_messages
CREATE TABLE IF NOT EXISTS contact_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  subject    TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- admin_user (single row — you)
CREATE TABLE IF NOT EXISTS admin_user (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- password_reset_tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens (token) WHERE used_at IS NULL;

-- visitor_logs — portfolio visitor analytics
CREATE TABLE IF NOT EXISTS visitor_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  visited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address    TEXT,                     -- raw IP (for geo lookup)
  country_code  TEXT,                     -- CF-IPCountry 2-letter code
  country       TEXT,                     -- full country name from ip-api.com
  city          TEXT,
  region        TEXT,
  latitude      NUMERIC(9,6),
  longitude     NUMERIC(9,6),
  browser       TEXT,                     -- parsed from User-Agent
  os            TEXT,
  device_type   TEXT,                     -- desktop | mobile | tablet
  referer_raw   TEXT,
  referer_label TEXT,                     -- LinkedIn | Google | GitHub | Direct | Other
  language      TEXT,
  is_bot        BOOLEAN     NOT NULL DEFAULT FALSE,
  session_id    TEXT                      -- cookie UUID for session dedup
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_published   ON projects (published, order_index);
CREATE INDEX IF NOT EXISTS idx_projects_featured    ON projects (featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_project_images_proj  ON project_images (project_id, order_index);
CREATE INDEX IF NOT EXISTS idx_skills_category      ON skills (category, order_index);
CREATE INDEX IF NOT EXISTS idx_certs_order          ON certifications (order_index, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread      ON contact_messages (read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_visited_at   ON visitor_logs (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_country      ON visitor_logs (country_code);
CREATE INDEX IF NOT EXISTS idx_visitor_session      ON visitor_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_not_bot      ON visitor_logs (is_bot) WHERE is_bot = FALSE;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_experiences_updated_at
  BEFORE UPDATE ON experiences FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_certifications_updated_at
  BEFORE UPDATE ON certifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_profile_updated_at
  BEFORE UPDATE ON profile FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
--  JOB AGGREGATION SYSTEM — Tables
-- ============================================================

-- companies — normalized company data cache
CREATE TABLE IF NOT EXISTS companies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     TEXT,                       -- API-provided company ID (if any)
  name            TEXT        NOT NULL,
  industry        TEXT,
  size            TEXT,                       -- e.g., "51-200", "1000+"
  logo_url        TEXT,
  website_url     TEXT,
  founded_year    INT,
  headquarters    TEXT,                       -- city, country
  description     TEXT,
  verified        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(external_id)
);

-- jobs_raw — raw jobs from API (before AI filtering)
CREATE TABLE IF NOT EXISTS jobs_raw (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     TEXT        NOT NULL UNIQUE,  -- API-provided job ID
  company_id      UUID        REFERENCES companies(id) ON DELETE CASCADE,
  company_name    TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  location        TEXT,                       -- e.g., "San Francisco, CA", "Remote"
  job_type        TEXT,                       -- Full-time, Contract, Temporary
  description     TEXT        NOT NULL,
  requirements    TEXT,                       -- raw requirements
  salary_min      NUMERIC(10, 2),
  salary_max      NUMERIC(10, 2),
  salary_currency TEXT,
  posted_at       TIMESTAMPTZ NOT NULL,
  apply_url       TEXT        NOT NULL,
  source_api      TEXT        NOT NULL,       -- "job_postings_api", "greenhouse", etc.
  raw_data        JSONB,                      -- store full API response for reference
  dedup_hash      TEXT,                       -- hash(title + company + location)
  is_duplicate    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- jobs — processed jobs with AI filtering metadata
CREATE TABLE IF NOT EXISTS jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_raw_id      UUID        NOT NULL UNIQUE REFERENCES jobs_raw(id) ON DELETE CASCADE,
  external_id     TEXT        NOT NULL UNIQUE,
  company_id      UUID        REFERENCES companies(id) ON DELETE CASCADE,
  company_name    TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  location        TEXT,
  job_type        TEXT,
  description     TEXT        NOT NULL,
  requirements    TEXT,
  salary_min      NUMERIC(10, 2),
  salary_max      NUMERIC(10, 2),
  salary_currency TEXT,
  posted_at       TIMESTAMPTZ NOT NULL,
  apply_url       TEXT        NOT NULL,
  source_api      TEXT        NOT NULL,
  -- AI Filtering & Scoring
  relevance_score SMALLINT    CHECK (relevance_score BETWEEN 0 AND 100),
  ai_decision     TEXT,                       -- "KEEP", "REVIEW", "DROP"
  ai_reasoning    TEXT,                       -- brief reasoning from AI
  tech_stack      TEXT[],     NOT NULL DEFAULT '{}',
  seniority_level TEXT,                       -- "Junior", "Mid", "Senior", "Lead"
  visa_sponsored  BOOLEAN,                    -- null if unknown
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at      TIMESTAMPTZ,                -- soft delete via TTL
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- job_tags — searchable tags per job
CREATE TABLE IF NOT EXISTS job_tags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tag             TEXT        NOT NULL,       -- "kubernetes", "aws", "go", etc.
  category        TEXT        NOT NULL,       -- "tech", "seniority", "location"
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- user_preferences — user job search preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,       -- future: link to users table
  desired_roles   TEXT[]      NOT NULL DEFAULT '{}',
  desired_locations TEXT[]    NOT NULL DEFAULT '{}',
  min_salary      NUMERIC(10, 2),
  preferred_companies TEXT[]  NOT NULL DEFAULT '{}',
  excluded_companies TEXT[]   NOT NULL DEFAULT '{}',
  required_tech_stack TEXT[]  NOT NULL DEFAULT '{}',
  avoid_tech_stack TEXT[]     NOT NULL DEFAULT '{}',
  preferred_seniority TEXT[],                 -- array of levels
  visa_requirement TEXT,                      -- "required", "preferred", "any"
  min_relevance_score SMALLINT DEFAULT 70,    -- only alert on jobs with score >= this
  job_types       TEXT[]      NOT NULL DEFAULT '{"Full-time"}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- user_alerts — triggered job alerts for users
CREATE TABLE IF NOT EXISTS user_alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  job_id          UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  alert_type      TEXT        NOT NULL,       -- "email", "telegram", "slack"
  sent_at         TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  error_message   TEXT,                       -- if sending failed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- user_saved_jobs — user's saved/bookmarked jobs
CREATE TABLE IF NOT EXISTS user_saved_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  job_id          UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  notes           TEXT,
  saved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

-- job_ingestion_logs — track ingestion runs for observability
CREATE TABLE IF NOT EXISTS job_ingestion_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_api      TEXT        NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          TEXT        NOT NULL,       -- "PENDING", "SUCCESS", "FAILED", "PARTIAL"
  jobs_fetched    INT,
  jobs_new        INT,
  jobs_duplicates INT,
  jobs_filtered   INT,
  error_message   TEXT,
  duration_ms     INT,                        -- milliseconds
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  JOB SYSTEM — Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_companies_name ON companies (name);
CREATE INDEX IF NOT EXISTS idx_companies_external_id ON companies (external_id);

CREATE INDEX IF NOT EXISTS idx_jobs_raw_posted_at ON jobs_raw (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_raw_external_id ON jobs_raw (external_id);
CREATE INDEX IF NOT EXISTS idx_jobs_raw_dedup_hash ON jobs_raw (dedup_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_raw_is_duplicate ON jobs_raw (is_duplicate) WHERE is_duplicate = FALSE;
CREATE INDEX IF NOT EXISTS idx_jobs_raw_company_id ON jobs_raw (company_id);

CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_relevance_score ON jobs (relevance_score DESC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_location ON jobs (location);
CREATE INDEX IF NOT EXISTS idx_jobs_title_tsvector ON jobs USING GIN (to_tsvector('english', title || ' ' || description));
CREATE INDEX IF NOT EXISTS idx_jobs_is_active ON jobs (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_jobs_external_id ON jobs (external_id);

CREATE INDEX IF NOT EXISTS idx_job_tags_job_id ON job_tags (job_id);
CREATE INDEX IF NOT EXISTS idx_job_tags_tag ON job_tags (tag);
CREATE INDEX IF NOT EXISTS idx_job_tags_category ON job_tags (category);

CREATE INDEX IF NOT EXISTS idx_user_prefs_user_id ON user_preferences (user_id);

CREATE INDEX IF NOT EXISTS idx_user_alerts_user_id ON user_alerts (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_alerts_job_id ON user_alerts (job_id);
CREATE INDEX IF NOT EXISTS idx_user_alerts_sent_at ON user_alerts (sent_at DESC) WHERE sent_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_saved_jobs_user_id ON user_saved_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_user_saved_jobs_job_id ON user_saved_jobs (job_id);

CREATE INDEX IF NOT EXISTS idx_ingestion_logs_source_api ON job_ingestion_logs (source_api, started_at DESC);

-- ============================================================
--  JOB SYSTEM — Triggers
-- ============================================================

CREATE OR REPLACE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_user_prefs_updated_at
  BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
--  REFEREE CONTACT REQUESTS — recruiter requests referee contact
-- ============================================================

CREATE TABLE IF NOT EXISTS referee_contact_requests (
  id                             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id                     UUID        NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
  requester_name                 TEXT        NOT NULL,
  requester_email                TEXT        NOT NULL,
  requester_email_verified       BOOLEAN     NOT NULL DEFAULT false,
  requester_company              TEXT,
  requester_linkedin_url         TEXT,
  requester_purpose              TEXT        NOT NULL DEFAULT 'recruiting'
                                   CONSTRAINT rcr_purpose_check CHECK (requester_purpose IN ('recruiting','collaboration','other')),
  requester_message              TEXT,
  status                         TEXT        NOT NULL DEFAULT 'submitted'
                                   CONSTRAINT rcr_status_check CHECK (status IN (
                                     'submitted','approved','rejected',
                                     'consent_requested','consent_given','consent_denied',
                                     'fulfilled','declined','expired'
                                   )),
  -- email verification (requester confirms their email before admin sees it)
  verification_token             UUID        UNIQUE DEFAULT gen_random_uuid(),
  verification_token_expires_at  TIMESTAMPTZ,
  -- referee consent (admin sends to referee, referee clicks yes/no)
  consent_token                  UUID        UNIQUE,
  consent_token_expires_at       TIMESTAMPTZ,
  consent_resend_count           INT         NOT NULL DEFAULT 0,  -- max 2 admin resends after denial
  consent_reminder_count         INT         NOT NULL DEFAULT 0,  -- auto reminders (every 3 days, max 3)
  consent_last_reminded_at       TIMESTAMPTZ,
  consent_requested_at           TIMESTAMPTZ,
  consent_responded_at           TIMESTAMPTZ,
  -- admin fields
  admin_note                     TEXT,   -- sent alongside contact details on fulfillment
  resend_note                    TEXT,   -- required note when admin resends after denial
  -- timestamps
  fulfilled_at                   TIMESTAMPTZ,
  declined_at                    TIMESTAMPTZ,
  expires_at                     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcr_referee_id         ON referee_contact_requests (referee_id);
CREATE INDEX IF NOT EXISTS idx_rcr_status             ON referee_contact_requests (status);
CREATE INDEX IF NOT EXISTS idx_rcr_created_at         ON referee_contact_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcr_verification_token ON referee_contact_requests (verification_token)
  WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rcr_consent_token      ON referee_contact_requests (consent_token)
  WHERE consent_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rcr_consent_reminder   ON referee_contact_requests (status, consent_last_reminded_at)
  WHERE status = 'consent_requested';
