-- ============================================================
--  Migration 042 — CV requests (email-gated CV downloads)
--
--  The public site no longer serves the CV PDF directly. A visitor enters
--  their email (required) and, optionally, name / company / role; the CV in
--  the chosen language (EN/FR) is emailed to them and you are notified.
--  Each request is recorded here for the "CV Requests" dashboard.
--
--  Privacy (also on the public privacy page):
--    - name, company, role, notes are cleared after 90 days
--    - the email is removed after 12 months (row anonymised); country,
--      language and date stay for the dashboard history
--    - the IP is never stored — only a salted hash, used for rate limiting
--
--  Idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS cv_requests (
  id                     BIGSERIAL PRIMARY KEY,
  email                  TEXT,                         -- NULL once anonymised
  email_domain           TEXT,
  name                   TEXT,
  company                TEXT,
  requester_role         TEXT CHECK (requester_role IN ('recruiter', 'hiring_manager', 'other')),
  language               TEXT NOT NULL CHECK (language IN ('en', 'fr')),
  source                 TEXT,                         -- where on the site: hero, navbar, mobile…
  status                 TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error                  TEXT,
  message_id             TEXT,
  consent_at             TIMESTAMPTZ NOT NULL,
  ip_hash                TEXT,
  country                TEXT,
  country_code           TEXT,
  region                 TEXT,
  city                   TEXT,
  device                 TEXT,
  browser                TEXT,
  os                     TEXT,
  referrer               TEXT,
  matched_application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
  contacted_at           TIMESTAMPTZ,
  notes                  TEXT,
  details_cleared_at     TIMESTAMPTZ,
  anonymised_at          TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cv_requests_created_at ON cv_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS cv_requests_email      ON cv_requests (lower(email), language, created_at DESC);
CREATE INDEX IF NOT EXISTS cv_requests_ip_hash    ON cv_requests (ip_hash, created_at DESC);
