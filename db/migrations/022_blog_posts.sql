-- 022_blog_posts.sql
-- Adds blog_posts table for Medium RSS-sourced blog content.
-- Ingestion is always admin-triggered (POST /api/admin/blog/sync) — there is
-- no scheduled auto-sync — so this table is a reviewable staging area, not
-- a live mirror. medium_guid dedupes re-ingestion of the same Medium post.

CREATE TABLE IF NOT EXISTS blog_posts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  medium_guid      TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  excerpt          TEXT,
  cover_image_url  TEXT,
  medium_url       TEXT        NOT NULL,
  tags             TEXT[]      NOT NULL DEFAULT '{}',
  published_at     TIMESTAMPTZ,
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visible_on_site  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_medium_guid_key ON blog_posts (medium_guid);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts (published_at DESC);
