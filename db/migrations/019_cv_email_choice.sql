-- 019_cv_email_choice.sql
-- The CV Identity page ("Email Displayed on CV") writes to cv_email_choice,
-- but the column never existed — saves were silently dropped because
-- cvIdentity.js's CV_FIELDS loop only persists known columns.

ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS cv_email_choice text DEFAULT 'gmail'
    CHECK (cv_email_choice IN ('gmail', 'professional', 'both', 'none'));
