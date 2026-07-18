-- ============================================================
--  Migration 024 — Career-site discovery: targets & registries
--  Safe to re-run: all IF NOT EXISTS / OR REPLACE
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/024_job_targeting.sql
-- ============================================================

-- ── job_targets — admin-defined role+location pairs ───────────
-- Each row is an independently pausable target. Discovery only
-- ever searches for active targets — no hardcoded company list.
CREATE TABLE IF NOT EXISTS job_targets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_query  TEXT        NOT NULL,
  locations   TEXT[]      NOT NULL DEFAULT '{}', -- empty/{Remote} = remote-open
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  min_score   SMALLINT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Added after initial creation — ALTER so it applies even if job_targets
-- already existed (CREATE TABLE IF NOT EXISTS above would otherwise skip it).
ALTER TABLE job_targets
  ADD COLUMN IF NOT EXISTS posted_within_days SMALLINT; -- NULL = no constraint, e.g. 7 = last 7 days only

CREATE INDEX IF NOT EXISTS idx_job_targets_active ON job_targets (is_active);

-- ── known_boards — self-building ATS board registry ───────────
-- Search discovers a board once; every subsequent run polls it
-- directly via its structured API instead of re-searching for it.
CREATE TABLE IF NOT EXISTS known_boards (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ats_platform          TEXT        NOT NULL,
  board_slug            TEXT        NOT NULL,
  first_discovered_via  TEXT,
  last_polled_at        TIMESTAMPTZ,
  last_yield_count      INT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ats_platform, board_slug)
);

CREATE INDEX IF NOT EXISTS idx_known_boards_platform ON known_boards (ats_platform);

-- ── crawl_seen_urls — cheap pre-fetch dedup gate ───────────────
-- Registry, not job postings: never purged on the jobs/jobs_raw
-- retention schedule (see 14-day purge in jobIngestionService.js).
CREATE TABLE IF NOT EXISTS crawl_seen_urls (
  url            TEXT        PRIMARY KEY,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Auto-update trigger (reuses set_updated_at_generic from 002) ──
CREATE OR REPLACE TRIGGER trg_job_targets_updated_at
  BEFORE UPDATE ON job_targets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_generic();
