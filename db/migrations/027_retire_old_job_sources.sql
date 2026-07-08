-- ============================================================
--  Migration 027 — Retire old job-board sources dead schema
--  Safe to re-run: DROP ... IF EXISTS
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/027_retire_old_job_sources.sql
-- ============================================================

-- job_tags was never written to or read by any app code (verified via
-- grep across api/, admin-ui/, user-ui/, scraper/) — a leftover from an
-- earlier design that was superseded by tech_stack/required_skills columns.
DROP TABLE IF EXISTS job_tags;

-- jobs.ai_model was never populated by any scoring path (pattern or LLM) —
-- unlike application_documents.ai_model, which is actively used and unrelated.
ALTER TABLE jobs DROP COLUMN IF EXISTS ai_model;
