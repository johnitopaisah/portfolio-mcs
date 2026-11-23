-- ============================================================
--  Migration 043 — Privacy: data minimisation (Nov 2026 review)
--
--  1. visitor_logs kept every visitor's full IP address forever (491k rows
--     since 2026-04-13), plus exact coordinates. Visits now store a daily
--     rotating anonymous code (visitor_hash, same scheme as blog_clicks) and
--     no IP, no coordinates, no cookie. Existing rows are anonymised here.
--  2. visitor_daily: individual visits are folded into daily totals after
--     13 months (services/privacyRetention.js), so long-term stats survive.
--  3. Referees' email/phone are never published on the site — always
--     "available on request" (the contact-request flow with their consent).
--
--  Retention for other tables (contact messages, login log, referee contact
--  requests, recruiter emails) is enforced by services/privacyRetention.js.
--  Idempotent.
-- ============================================================

-- 1. visitor logs ------------------------------------------------------
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS visitor_hash TEXT;

UPDATE visitor_logs
SET ip_address = NULL, latitude = NULL, longitude = NULL
WHERE ip_address IS NOT NULL OR latitude IS NOT NULL OR longitude IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_hash_time ON visitor_logs (visitor_hash, visited_at) WHERE visitor_hash IS NOT NULL;

-- 2. daily totals --------------------------------------------------------
CREATE TABLE IF NOT EXISTS visitor_daily (
  day          DATE NOT NULL,
  country      TEXT NOT NULL DEFAULT 'Unknown',
  referer      TEXT NOT NULL DEFAULT 'Direct',
  device_type  TEXT NOT NULL DEFAULT 'desktop',
  visits       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country, referer, device_type)
);

-- 3. referees: contact details never public --------------------------------
UPDATE referees SET available_on_request = TRUE WHERE available_on_request IS DISTINCT FROM TRUE;
ALTER TABLE referees ALTER COLUMN available_on_request SET DEFAULT TRUE;

-- 4. blog cover images served from this site ------------------------------
-- They loaded straight from Medium's CDN, sending every visitor's IP to
-- Medium and letting its CDN set a cookie (_cfuvid). Now fetched once by the
-- API (GET /api/blog/:id/cover) and stored here.
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_image      BYTEA;
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_image_mime TEXT;
