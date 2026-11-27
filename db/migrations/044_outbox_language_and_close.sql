-- ============================================================
--  Migration 044 — Outbox language, French template, closing an application
--
--  1. Each outbox email has a language (en/fr) and the reason it was chosen
--     ("Extia wrote in French"). NULL on older rows = detect from the text.
--  2. Email templates have a language; a French follow-up template is added
--     so French drafts work without the AI.
--  3. When an application is closed (rejected, withdrawn, …) its unsent
--     outbox emails are cancelled at once, with a history entry — by a
--     trigger, because statuses change from several places (dashboard,
--     Outbox, the email worker). Same status list as migration 038 and
--     FINAL_STATUSES in api/src/constants/applicationStatuses.js (a test
--     checks all three). 'sending' is left alone: it is already in flight.
--
--  4. email_responses.not_about_application_ids: rejections you dismissed
--     for an application.
--
--  Idempotent: IF NOT EXISTS / CREATE OR REPLACE / guarded inserts.
-- ============================================================

ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS language        TEXT;
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS language_reason TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outbound_emails_language_check') THEN
    ALTER TABLE outbound_emails ADD CONSTRAINT outbound_emails_language_check CHECK (language IN ('en', 'fr'));
  END IF;
END $$;

-- A rejection email you said is NOT about an application ("Not this one" in
-- the Outbox) never blocks or flags that application's follow-ups again.
ALTER TABLE email_responses ADD COLUMN IF NOT EXISTS not_about_application_ids INTEGER[] NOT NULL DEFAULT '{}';

ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_templates_language_check') THEN
    ALTER TABLE email_templates ADD CONSTRAINT email_templates_language_check CHECK (language IN ('en', 'fr'));
  END IF;
END $$;

INSERT INTO email_templates (name, category, subject_template, body_template, is_system, language)
SELECT 'Relance de candidature', 'follow_up',
       'Suivi de ma candidature — {{role}}',
       E'Bonjour {{recruiter_name}},\n\nJe me permets de revenir vers vous au sujet de ma candidature au poste de {{role}} chez {{company}}, envoyée le {{applied_date}}. Ce poste m''intéresse toujours beaucoup et je reste à votre disposition pour tout complément d''information.\n\nBien cordialement,\n{{your_name}}',
       TRUE, 'fr'
WHERE NOT EXISTS (SELECT 1 FROM email_templates WHERE category = 'follow_up' AND language = 'fr');

CREATE OR REPLACE FUNCTION cancel_outbox_on_final_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED', 'ACCEPTED', 'DECLINED_OFFER')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    WITH c AS (
      UPDATE outbound_emails
      SET status = 'cancelled',
          cancel_reason = 'the application was closed (' || lower(replace(NEW.status, '_', ' ')) || ')',
          approval_token_version = NULL,
          updated_at = NOW()
      WHERE application_id = NEW.id AND status IN ('draft', 'pending_approval', 'approved')
      RETURNING id, cancel_reason
    )
    INSERT INTO outbound_email_events (outbound_email_id, event, actor, detail)
    SELECT id, 'cancelled', 'system', jsonb_build_object('reason', cancel_reason, 'application_closed', NEW.status) FROM c;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancel_outbox_on_final_status ON applications;
CREATE TRIGGER trg_cancel_outbox_on_final_status
  AFTER UPDATE OF status ON applications
  FOR EACH ROW
  EXECUTE FUNCTION cancel_outbox_on_final_status();

-- One-off: unsent emails for applications that are already closed.
WITH c AS (
  UPDATE outbound_emails o
  SET status = 'cancelled',
      cancel_reason = 'the application was closed (' || lower(replace(a.status, '_', ' ')) || ')',
      approval_token_version = NULL,
      updated_at = NOW()
  FROM applications a
  WHERE a.id = o.application_id
    AND o.status IN ('draft', 'pending_approval', 'approved')
    AND a.status IN ('REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED', 'ACCEPTED', 'DECLINED_OFFER')
  RETURNING o.id, o.cancel_reason, a.status
)
INSERT INTO outbound_email_events (outbound_email_id, event, actor, detail)
SELECT id, 'cancelled', 'system', jsonb_build_object('reason', cancel_reason, 'application_closed', status) FROM c;
