-- ============================================================
--  Portfolio MCS — Master Schema
--  Auto-runs on first container start via docker-entrypoint-initdb.d
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- profile (single row)
CREATE TABLE IF NOT EXISTS profile (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  headline      TEXT        NOT NULL,
  bio           TEXT        NOT NULL,
  avatar        BYTEA,
  avatar_mime   TEXT,
  resume        BYTEA,
  resume_mime   TEXT,
  github_url    TEXT,
  linkedin_url  TEXT,
  email         TEXT        NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_published ON projects (published, order_index);
CREATE INDEX IF NOT EXISTS idx_projects_featured  ON projects (featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_skills_category    ON skills (category, order_index);
CREATE INDEX IF NOT EXISTS idx_certs_order        ON certifications (order_index, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread    ON contact_messages (read, created_at DESC);

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
