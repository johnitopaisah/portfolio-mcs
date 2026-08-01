-- ============================================================
--  Migration 032 — Email → Application matching upgrade
--  Adds AI-extracted company/role + match provenance to
--  email_responses, a "suggested but unconfirmed" match slot,
--  and a trigram index so fuzzy company-name matching (used by
--  applicationMatchingService.js) doesn't full-scan applications.
--
--  pg_trgm itself is already enabled by migration 025 — no
--  CREATE EXTENSION needed here.
--
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/032_email_application_matching.sql
-- ============================================================

ALTER TABLE email_responses
  ADD COLUMN IF NOT EXISTS extracted_company        text,
  ADD COLUMN IF NOT EXISTS extracted_role            text,
  ADD COLUMN IF NOT EXISTS match_method              text,
  ADD COLUMN IF NOT EXISTS suggested_application_id  integer REFERENCES applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_applications_company_trgm
  ON applications USING GIN (company_name gin_trgm_ops);
