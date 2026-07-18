

-- 021_manual_document_editing.sql
-- Adds support for manually editing a generated CV/cover letter's HTML
-- directly (rich-text edits), independent of the AI/template pipeline.
-- Once a document is manually edited it is "frozen" from further
-- AI regeneration/cosmetic reformatting unless the user explicitly
-- discards the edits — content_json is left untouched so the original
-- AI output remains available for a "compare to AI version" view.

ALTER TABLE application_documents
  ADD COLUMN IF NOT EXISTS is_manually_edited BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS edited_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_autosaved_at   TIMESTAMPTZ;
