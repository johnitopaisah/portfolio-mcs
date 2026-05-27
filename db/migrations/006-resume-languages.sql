-- Migration 006: per-language resume columns on profile
-- Adds resume_en / resume_fr BYTEA columns so the admin can upload
-- pre-made PDFs for each language.  The public /resume?lang=en|fr
-- endpoint tries the uploaded column first, then falls back to
-- generating a PDF on-the-fly from the active base_cv_versions record.

ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS resume_en      bytea,
  ADD COLUMN IF NOT EXISTS resume_en_mime text,
  ADD COLUMN IF NOT EXISTS resume_fr      bytea,
  ADD COLUMN IF NOT EXISTS resume_fr_mime text;
