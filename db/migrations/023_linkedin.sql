-- General key-value store for OAuth tokens and app settings
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track which blog posts have been shared to LinkedIn
ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS linkedin_shared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS linkedin_post_urn  TEXT;
