-- ============================================================
--  Migration 002 — Job feedback + cleanup tables
--  Safe to re-run (all IF NOT EXISTS)
-- ============================================================

-- job_feedback: records your apply/skip/interested decisions per job.
-- Used by the feedback learning loop to recalibrate AI scoring weights.
CREATE TABLE IF NOT EXISTS job_feedback (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  decision    TEXT        NOT NULL CHECK (decision IN ('applied','skip','interested')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id)   -- one decision per job, ON CONFLICT DO UPDATE updates it
);

CREATE INDEX IF NOT EXISTS idx_job_feedback_decision    ON job_feedback (decision);
CREATE INDEX IF NOT EXISTS idx_job_feedback_created_at  ON job_feedback (created_at DESC);

-- Drop the multi-user tables if they were created (we're single-user now).
-- These are safe to drop — no code references them in the updated codebase.
DROP TABLE IF EXISTS user_alerts           CASCADE;
DROP TABLE IF EXISTS user_saved_jobs       CASCADE;
DROP TABLE IF EXISTS user_preferences      CASCADE;

-- Add is_active column to jobs if missing (guard for schema drift)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Add a partial index so active-job queries stay fast as the table grows
CREATE INDEX IF NOT EXISTS idx_jobs_active_score
  ON jobs (relevance_score DESC, posted_at DESC)
  WHERE is_active = TRUE AND ai_decision != 'DROP';
