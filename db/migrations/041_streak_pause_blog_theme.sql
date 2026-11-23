-- ============================================================
--  Migration 041 — Weekly streak fix, availability pause, latest synced
--                  blog post, theme defaults
--
--  1. weekly_snapshots: the Sunday-23:55 job computed the NEXT week's Monday
--     (getDay() is 0 on Sunday), so every snapshot since October counted a
--     week that had not started: 0 applications, goal_met = false, and the
--     dashboard showed "0 week streak" after a 41/40 week. Store the goal and
--     whether the search was paused, and rebuild the existing rows from the
--     real applications (Paris weeks, current goal — older goals were never
--     recorded).
--  2. availability_changes: history of Available / Open to right / Not open,
--     so paused weeks can be recognised (they neither count nor break the
--     streak) and time-based reminder rules restart their clock on resume.
--  3. blog_posts.first_ingested_at: when a post was FIRST synced (the sync
--     re-stamps ingested_at on every post, every run). The public "Latest"
--     header shows the post added by the most recent sync.
--  4. profile.default_theme: theme for visitors who have not picked one;
--     user_settings.admin_theme: the admin dashboard's theme.
--
--  Idempotent.
-- ============================================================

-- 1. weekly snapshots ---------------------------------------------------
ALTER TABLE weekly_snapshots ADD COLUMN IF NOT EXISTS goal   INTEGER;
ALTER TABLE weekly_snapshots ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE;

-- Rows were labelled one week late and counted nothing: rebuild every
-- completed Paris week from the first application until last week.
WITH g AS (SELECT COALESCE((SELECT weekly_application_goal FROM user_settings LIMIT 1), 5) AS goal),
weeks AS (
  SELECT generate_series(
           date_trunc('week', (SELECT MIN(created_at) FROM applications) AT TIME ZONE 'Europe/Paris'),
           date_trunc('week', NOW() AT TIME ZONE 'Europe/Paris') - INTERVAL '1 week',
           INTERVAL '1 week')::date AS week_start
),
counts AS (
  SELECT w.week_start, COUNT(a.id)::int AS cnt
  FROM weeks w
  LEFT JOIN applications a
    ON (a.created_at AT TIME ZONE 'Europe/Paris') >= w.week_start
   AND (a.created_at AT TIME ZONE 'Europe/Paris') <  w.week_start + 7
  GROUP BY w.week_start
)
INSERT INTO weekly_snapshots (week_start, applications_count, goal, goal_met)
SELECT c.week_start, c.cnt, g.goal, c.cnt >= g.goal FROM counts c, g
ON CONFLICT (week_start) DO UPDATE SET
  applications_count = EXCLUDED.applications_count,
  goal               = COALESCE(weekly_snapshots.goal, EXCLUDED.goal),
  goal_met           = EXCLUDED.applications_count >= COALESCE(weekly_snapshots.goal, EXCLUDED.goal);

-- The bogus row for the week in progress (written on Sunday night).
DELETE FROM weekly_snapshots
WHERE week_start >= (date_trunc('week', NOW() AT TIME ZONE 'Europe/Paris'))::date;

-- 2. availability history ----------------------------------------------
CREATE TABLE IF NOT EXISTS availability_changes (
  id          BIGSERIAL PRIMARY KEY,
  status      TEXT NOT NULL CHECK (status IN ('active', 'passive', 'not_open')),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS availability_changes_changed_at ON availability_changes (changed_at);

-- Starting point: the current status, as of now.
INSERT INTO availability_changes (status)
SELECT availability_status FROM profile
WHERE NOT EXISTS (SELECT 1 FROM availability_changes)
LIMIT 1;

-- 3. blog: first sync time ---------------------------------------------
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS first_ingested_at TIMESTAMPTZ;
UPDATE blog_posts SET first_ingested_at = ingested_at WHERE first_ingested_at IS NULL;
ALTER TABLE blog_posts ALTER COLUMN first_ingested_at SET DEFAULT NOW();
ALTER TABLE blog_posts ALTER COLUMN first_ingested_at SET NOT NULL;

-- 4. themes ------------------------------------------------------------
ALTER TABLE profile       ADD COLUMN IF NOT EXISTS default_theme TEXT NOT NULL DEFAULT 'dark';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS admin_theme   TEXT NOT NULL DEFAULT 'dark';
DO $$ BEGIN
  ALTER TABLE profile ADD CONSTRAINT profile_default_theme_check CHECK (default_theme IN ('dark', 'light'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE user_settings ADD CONSTRAINT user_settings_admin_theme_check CHECK (admin_theme IN ('dark', 'light'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
