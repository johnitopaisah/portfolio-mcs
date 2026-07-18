-- ============================================================
--  Migration 025 — Enable pg_trgm for fuzzy job dedup
--  Safe to re-run: CREATE EXTENSION/INDEX IF NOT EXISTS
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/025_pg_trgm.sql
-- ============================================================

-- Enables similarity(text, text) used by deduplicationService.js's
-- findSimilarJobs() — previously called but silently no-op'd (caught
-- exception, "pg_trgm not available") since the extension was never enabled.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index so similarity() lookups don't full-scan jobs_raw as it grows.
CREATE INDEX IF NOT EXISTS idx_jobs_raw_title_trgm
  ON jobs_raw USING GIN (title gin_trgm_ops);
