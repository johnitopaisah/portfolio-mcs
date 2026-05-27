-- ============================================================
--  Migration 005 — Application Intelligence CRM
--  Creates tables: base_cv_versions, applications,
--  application_documents, application_events, email_responses
--  Seeds base_cv_versions from existing portfolio tables.
--
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/005-application-crm.sql
-- ============================================================

BEGIN;

-- ============================================================
--  1. base_cv_versions
--  Stores versioned JSON snapshots of the master CV.
--  Built from profile/experiences/skills/certifications tables.
--  Never modified after insert — only new rows are added.
-- ============================================================
CREATE TABLE base_cv_versions (
  id            SERIAL      PRIMARY KEY,
  name          TEXT        NOT NULL,
  content_json  JSONB       NOT NULL,
  source_html   TEXT,
  version       INTEGER     NOT NULL DEFAULT 1,
  is_active     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  2. applications
--  One row per job application.
--  job_id is UUID to match jobs.id (UUID primary key).
-- ============================================================
CREATE TABLE applications (
  id                      SERIAL      PRIMARY KEY,
  job_id                  UUID        REFERENCES jobs(id) ON DELETE SET NULL,
  company_name            TEXT        NOT NULL,
  job_title               TEXT        NOT NULL,
  job_url                 TEXT,
  company_domain          TEXT,
  source_platform         TEXT,
  application_email_used  TEXT,
  match_score             NUMERIC(4,2),
  status                  TEXT        NOT NULL DEFAULT 'DRAFT',
  applied_at              TIMESTAMPTZ,
  last_response_at        TIMESTAMPTZ,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_job_id ON applications(job_id);

-- ============================================================
--  3. application_documents
--  Per-application generated CVs and cover letters.
--  file_data BYTEA stores the raw PDF bytes — no external storage.
-- ============================================================
CREATE TABLE application_documents (
  id              SERIAL      PRIMARY KEY,
  application_id  INTEGER     NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  document_type   TEXT        NOT NULL CHECK (document_type IN ('CV', 'COVER_LETTER', 'MESSAGE')),
  content_json    JSONB,
  source_html     TEXT,
  file_data       BYTEA,
  version         INTEGER     NOT NULL DEFAULT 1,
  base_cv_version INTEGER     REFERENCES base_cv_versions(id),
  ai_model        TEXT,
  prompt_version  TEXT,
  generated_by_ai BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_app_docs_application_id ON application_documents(application_id);

-- ============================================================
--  4. application_events
--  Full audit timeline: every status change, note, email, etc.
-- ============================================================
CREATE TABLE application_events (
  id              SERIAL      PRIMARY KEY,
  application_id  INTEGER     NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  description     TEXT,
  event_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_app_events_application_id ON application_events(application_id);

-- ============================================================
--  5. email_responses
--  Inbound emails classified by AI, linked to an application.
-- ============================================================
CREATE TABLE email_responses (
  id                  SERIAL        PRIMARY KEY,
  application_id      INTEGER       REFERENCES applications(id) ON DELETE SET NULL,
  gmail_message_id    TEXT          UNIQUE,
  sender_email        TEXT,
  sender_name         TEXT,
  subject             TEXT,
  body_snippet        TEXT,
  received_at         TIMESTAMPTZ,
  ai_classification   TEXT,
  confidence_score    NUMERIC(4,3),
  raw_label           TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
--  Seed: assemble base CV from existing portfolio tables
--  Verbatim from prompt 01-db-migration.md
-- ============================================================
INSERT INTO base_cv_versions (name, content_json, is_active)
SELECT
  'v1 — assembled from portfolio DB',
  jsonb_build_object(
    'name',         p.name,
    'headline',     p.headline,
    'bio',          p.bio,
    'email',        p.email,
    'github_url',   p.github_url,
    'linkedin_url', p.linkedin_url,
    'hero_tags',    p.hero_tags,
    'experiences',  (
      SELECT jsonb_agg(jsonb_build_object(
        'company',    e.company,
        'role',       e.role,
        'description',e.description,
        'start_date', e.start_date,
        'end_date',   e.end_date,
        'ongoing',    e.ongoing,
        'tech_stack', e.tech_stack
      ) ORDER BY e.order_index)
      FROM experiences e
    ),
    'skills', (
      SELECT jsonb_agg(jsonb_build_object(
        'name',        s.name,
        'category',    s.category,
        'proficiency', s.proficiency
      ) ORDER BY s.order_index)
      FROM skills s
    ),
    'certifications', (
      SELECT jsonb_agg(jsonb_build_object(
        'name',           c.name,
        'issuer',         c.issuer,
        'issue_date',     c.issue_date,
        'expiry_date',    c.expiry_date,
        'credential_url', c.credential_url
      ) ORDER BY c.issue_date DESC)
      FROM certifications c
    )
  ),
  TRUE
FROM profile p
LIMIT 1;

COMMIT;
