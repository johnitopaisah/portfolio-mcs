-- ============================================================
--  Migration 001 — Add visitor_logs table
--  Run once against existing databases.
--  Safe to re-run (IF NOT EXISTS on everything).
-- ============================================================

CREATE TABLE IF NOT EXISTS visitor_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  visited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address    TEXT,                     -- raw IP (for geo lookup + dedup)
  country_code  TEXT,                     -- CF-IPCountry 2-letter code (free, no lookup needed)
  country       TEXT,                     -- full name from ip-api.com
  city          TEXT,
  region        TEXT,
  latitude      NUMERIC(9,6),
  longitude     NUMERIC(9,6),
  browser       TEXT,                     -- parsed from User-Agent
  os            TEXT,
  device_type   TEXT,                     -- desktop | mobile | tablet
  referer_raw   TEXT,                     -- raw Referer header
  referer_label TEXT,                     -- LinkedIn | Google | Direct | GitHub | Other
  language      TEXT,                     -- first value from Accept-Language
  is_bot        BOOLEAN     NOT NULL DEFAULT FALSE,
  session_id    TEXT                      -- cookie-based UUID for session dedup
);

CREATE INDEX IF NOT EXISTS idx_visitor_visited_at  ON visitor_logs (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_country      ON visitor_logs (country_code);
CREATE INDEX IF NOT EXISTS idx_visitor_session      ON visitor_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_is_bot       ON visitor_logs (is_bot) WHERE is_bot = FALSE;
