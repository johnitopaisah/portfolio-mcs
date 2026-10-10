-- ============================================================
--  Migration 033 — Role-aware email → application matching
--  An application is identified by company + role, not company
--  alone, so two roles at the same company are tracked as two
--  separate applications (see applicationMatchingService.js).
--
--  thread_id lets a follow-up that doesn't repeat the role stay
--  on the application its thread was already linked to. Gmail
--  supplies a native thread id; for IMAP it is the root
--  Message-ID of the References chain.
--
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/033_role_aware_email_matching.sql
-- ============================================================

ALTER TABLE email_responses
  ADD COLUMN IF NOT EXISTS thread_id text;

CREATE INDEX IF NOT EXISTS idx_email_responses_thread
  ON email_responses (source_account, thread_id)
  WHERE thread_id IS NOT NULL;

-- Backs the dashboard's per-day application counts.
CREATE INDEX IF NOT EXISTS idx_applications_created_at
  ON applications (created_at);
