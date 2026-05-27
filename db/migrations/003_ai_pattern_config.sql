-- ============================================================
--  Migration 003 — AI engine config + editable pattern scorer
--  Safe to re-run: all IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/003_ai_pattern_config.sql
-- ============================================================

-- Extend job_preferences with AI engine settings + editable pattern arrays
ALTER TABLE job_preferences
  ADD COLUMN IF NOT EXISTS ai_engine             TEXT     NOT NULL DEFAULT 'pattern',
  ADD COLUMN IF NOT EXISTS llm_enabled           BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ambiguous_min         SMALLINT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS ambiguous_max         SMALLINT NOT NULL DEFAULT 72,
  -- Editable pattern scorer arrays (empty = use hardcoded defaults in aiFilteringService)
  ADD COLUMN IF NOT EXISTS pattern_role_keywords TEXT[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pattern_tech_boosts   JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pattern_penalties     JSONB    NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pattern_locations     TEXT[]   NOT NULL DEFAULT '{}';

-- Normalise job_feedback column name and constraint.
-- Two competing 002 migrations created conflicting schemas:
--   002_add_job_feedback.sql → column 'decision' (values: applied|skip|interested)
--   002_job_system.sql       → column 'action'   (values: applied|saved|skipped|hidden)
-- Migration 003 makes both consistent: column named 'decision',
-- constraint accepts all valid values from both schemas.
DO $$
BEGIN
  -- If the 'action' column exists (002_job_system.sql was applied first),
  -- rename it to 'decision' so all code/queries use one name.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_feedback' AND column_name = 'action'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_feedback' AND column_name = 'decision'
  ) THEN
    ALTER TABLE job_feedback DROP CONSTRAINT IF EXISTS job_feedback_action_check;
    ALTER TABLE job_feedback RENAME COLUMN action TO decision;
  END IF;

  -- Now update (or create) the check constraint on 'decision' with the full value set
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_feedback' AND column_name = 'decision'
  ) THEN
    ALTER TABLE job_feedback DROP CONSTRAINT IF EXISTS job_feedback_decision_check;
    ALTER TABLE job_feedback DROP CONSTRAINT IF EXISTS job_feedback_action_check;
    ALTER TABLE job_feedback
      ADD CONSTRAINT job_feedback_decision_check
        CHECK (decision IN ('applied', 'saved', 'skipped', 'interested', 'skip', 'hidden'));
  END IF;
END;
$$;
