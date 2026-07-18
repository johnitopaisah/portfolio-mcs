-- ============================================================
--  Migration 016 — CV Generation Config & Cover Letter Support
--  Adds template selection, color scheme, section control, and
--  user hints columns to application_documents.
--  Also adds generation_config JSONB for future extensibility.
--
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/016_cv_generation_config.sql
-- ============================================================

BEGIN;

ALTER TABLE application_documents
  ADD COLUMN IF NOT EXISTS template_id       VARCHAR(50)  DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS color_scheme      VARCHAR(20)  DEFAULT 'colored',
  ADD COLUMN IF NOT EXISTS accent_color      VARCHAR(10)  DEFAULT '#2563EB',
  ADD COLUMN IF NOT EXISTS sections_included JSONB        DEFAULT '["summary","skills","experience","education","certifications"]'::jsonb,
  ADD COLUMN IF NOT EXISTS generation_hints  TEXT,
  ADD COLUMN IF NOT EXISTS generation_config JSONB        DEFAULT '{}'::jsonb;

COMMENT ON COLUMN application_documents.template_id IS 'CV template key: classic, modern, minimal, executive, technical, harvard, startup, wallstreet, ats-pure, creative, sidebar';
COMMENT ON COLUMN application_documents.color_scheme IS 'colored | bw';
COMMENT ON COLUMN application_documents.accent_color IS 'Hex accent color used when color_scheme=colored';
COMMENT ON COLUMN application_documents.sections_included IS 'Ordered array of section keys to render: summary, skills, experience, education, certifications, projects, references';
COMMENT ON COLUMN application_documents.generation_hints IS 'Free-text user instructions injected into AI tailoring prompt';
COMMENT ON COLUMN application_documents.generation_config IS 'Full generation config snapshot: intensity, hint_chips, section_presets, etc.';

COMMIT;
