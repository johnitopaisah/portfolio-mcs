-- ============================================================
--  Migration 038 — Close reminders when an application is finished
--
--  Follow-up / review reminders stayed open after an application was
--  rejected, withdrawn or otherwise closed, so they piled up as "overdue"
--  forever (35 of 187 on 18 Nov 2026) and pulled the dashboard Search
--  Health score down for applications that need no action.
--
--  A trigger (not application code) closes them, because status changes
--  come from several places: the API, the archive action, and the email
--  worker's auto-linking. Keep the status list in sync with
--  FINAL_STATUSES in api/src/constants/applicationStatuses.js (a test
--  checks this).
--
--  Idempotent: CREATE OR REPLACE / DROP IF EXISTS, and the one-off update
--  only touches reminders that are still open.
-- ============================================================

CREATE OR REPLACE FUNCTION close_reminders_on_final_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED', 'ACCEPTED', 'DECLINED_OFFER')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE application_reminders
    SET is_done = TRUE
    WHERE application_id = NEW.id AND is_done = FALSE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_reminders_on_final_status ON applications;
CREATE TRIGGER trg_close_reminders_on_final_status
  AFTER UPDATE OF status ON applications
  FOR EACH ROW
  EXECUTE FUNCTION close_reminders_on_final_status();

-- One-off: reminders already open on applications that are finished.
UPDATE application_reminders r
SET is_done = TRUE
FROM applications a
WHERE a.id = r.application_id
  AND r.is_done = FALSE
  AND a.status IN ('REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED', 'ACCEPTED', 'DECLINED_OFFER');
