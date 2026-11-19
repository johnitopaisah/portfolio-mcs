-- ============================================================
--  Migration 040 — Repair invalid application statuses and forbid them
--
--  In June 2026, before the email worker validated the AI's suggested
--  status, promotional emails (IBM, Coursera…) mis-linked to four
--  applications wrote free text into applications.status:
--    "Open for Review", "Not recruitment-related - promotional/marketing
--    email", "Not Recruitment Related - Archive",
--    "In Progress - Awaiting Next Steps".
--  The dashboard treats unknown statuses as active applications, so one of
--  them (no document attached) cost Search Health a point (99/100, 16/17
--  "Submitted docs attached" on 19 Nov 2026).
--
--  1. Each known row goes back to the last real status in its own history:
--       IBM (scraper, CVs generated, never applied)  → CV_GENERATED
--       CompuSafe (scraper, nothing generated)        → DRAFT
--       Omega CRM (APPLIED 22 Jun, no reply since)    → NO_RESPONSE
--       micro1 (last set to READY_TO_APPLY)           → READY_TO_APPLY
--     Any other invalid status (other environments) → ARCHIVED.
--     Every repair is recorded in the application's history.
--  2. A CHECK constraint makes the database reject any status outside the
--     pipeline. Keep its list in sync with VALID_STATUSES in
--     api/src/constants/applicationStatuses.js (a test checks this).
--
--  Idempotent: updates only match invalid statuses; the constraint is
--  dropped and re-created.
-- ============================================================

CREATE TEMP TABLE status_repair ON COMMIT DROP AS
SELECT a.id, a.status AS old_status,
       CASE a.status
         WHEN 'Open for Review'                                       THEN 'CV_GENERATED'
         WHEN 'Not recruitment-related - promotional/marketing email' THEN 'DRAFT'
         WHEN 'Not Recruitment Related - Archive'                     THEN 'NO_RESPONSE'
         WHEN 'In Progress - Awaiting Next Steps'                     THEN 'READY_TO_APPLY'
         ELSE 'ARCHIVED'
       END AS new_status
FROM applications a
WHERE a.status NOT IN (
  'DRAFT', 'CV_GENERATED', 'READY_TO_APPLY', 'APPLIED',
  'EMAIL_RECEIVED', 'HR_CONTACTED', 'INTERVIEW_INVITE',
  'TECHNICAL_TEST', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW',
  'OFFER', 'NEGOTIATING', 'ACCEPTED', 'DECLINED_OFFER',
  'REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED'
);

UPDATE applications a
SET status = r.new_status, updated_at = NOW()
FROM status_repair r
WHERE a.id = r.id;

INSERT INTO application_events (application_id, event_type, description)
SELECT r.id, 'STATUS_CHANGED',
       'Status repaired to ' || r.new_status || ' (was invalid AI text: "' || left(r.old_status, 120) || '")'
FROM status_repair r;

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_valid;
ALTER TABLE applications ADD CONSTRAINT applications_status_valid CHECK (status IN (
  'DRAFT', 'CV_GENERATED', 'READY_TO_APPLY', 'APPLIED',
  'EMAIL_RECEIVED', 'HR_CONTACTED', 'INTERVIEW_INVITE',
  'TECHNICAL_TEST', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW',
  'OFFER', 'NEGOTIATING', 'ACCEPTED', 'DECLINED_OFFER',
  'REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED'
));
