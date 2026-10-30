-- ============================================================
--  Migration 034 — Blog click tracking
--  One row per reader click from the portfolio through to Medium,
--  recorded by GET /api/blog/:id/go (see blogClickService.js).
--
--  Deliberately stores no IP address or exact coordinates:
--  visitor_hash is a keyed hash that changes every UTC day, so it can
--  count unique visitors within a day but not follow anyone across days.
--
--  blog_clicks keeps per-click detail for 90 days. After that,
--  blogClickRollupWorker.js folds rows into blog_click_daily (per-post
--  daily totals, kept indefinitely) and deletes them.
--
--  Apply BEFORE deploying the API — GET /api/blog/all reads these tables:
--    kubectl exec -n portfolio portfolio-db-0 -c postgres -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/034_blog_click_tracking.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_clicks (
  id             BIGSERIAL   PRIMARY KEY,
  post_id        UUID        NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  clicked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visitor_hash   TEXT        NOT NULL,
  country_code   TEXT,
  country        TEXT,
  region         TEXT,
  city           TEXT,
  device_type    TEXT,                 -- desktop | mobile | tablet
  os             TEXT,
  browser        TEXT,
  language       TEXT,
  source_page    TEXT,                 -- home | blog | other: where on the site the card was
  traffic_source TEXT                  -- LinkedIn | Google | Direct | ... | Unknown
);

CREATE INDEX IF NOT EXISTS idx_blog_clicks_clicked_at ON blog_clicks (clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_clicks_post_time  ON blog_clicks (post_id, clicked_at DESC);

CREATE TABLE IF NOT EXISTS blog_click_daily (
  post_id UUID    NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  day     DATE    NOT NULL,
  clicks  INTEGER NOT NULL,
  uniques INTEGER NOT NULL,
  PRIMARY KEY (post_id, day)
);
