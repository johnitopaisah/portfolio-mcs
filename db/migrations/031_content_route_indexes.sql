-- ============================================================
--  Migration 031 — Indexes matching the actual predicates used by
--  the public content-list routes (referees, education, social_links,
--  blog_posts). These tables previously had no index beyond their
--  primary key, so every request forced a full scan + sort even
--  though the tables are small — this brings their index coverage
--  in line with projects/certifications, which already had matching
--  indexes (idx_projects_published, idx_certs_order).
--  Safe to re-run: CREATE INDEX IF NOT EXISTS is idempotent.
--  Apply:
--    kubectl exec -n portfolio portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/031_content_route_indexes.sql
-- ============================================================

-- referees.js: WHERE visible = true ORDER BY order_index ASC, created_at ASC
CREATE INDEX IF NOT EXISTS idx_referees_visible_order
  ON referees (visible, order_index, created_at);

-- education.js: ORDER BY order_index ASC, start_date DESC (no WHERE filter)
CREATE INDEX IF NOT EXISTS idx_education_order
  ON education (order_index, start_date DESC);

-- socialLinks.js: WHERE visible = true ORDER BY order_index ASC, created_at ASC
CREATE INDEX IF NOT EXISTS idx_social_links_visible_order
  ON social_links (visible, order_index, created_at);

-- blog.js: WHERE visible_on_site = true ORDER BY published_at DESC NULLS LAST
CREATE INDEX IF NOT EXISTS idx_blog_posts_visible_published
  ON blog_posts (visible_on_site, published_at DESC);
