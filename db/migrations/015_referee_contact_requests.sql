-- Migration 015: Referee Contact Requests
-- Adds the referee_contact_requests table for the recruiter contact-request workflow.
-- Safe to run on existing databases (uses IF NOT EXISTS / IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS referee_contact_requests (
  id                             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id                     UUID        NOT NULL REFERENCES referees(id) ON DELETE CASCADE,
  requester_name                 TEXT        NOT NULL,
  requester_email                TEXT        NOT NULL,
  requester_email_verified       BOOLEAN     NOT NULL DEFAULT false,
  requester_company              TEXT,
  requester_linkedin_url         TEXT,
  requester_purpose              TEXT        NOT NULL DEFAULT 'recruiting'
                                   CONSTRAINT rcr_purpose_check CHECK (requester_purpose IN ('recruiting','collaboration','other')),
  requester_message              TEXT,
  status                         TEXT        NOT NULL DEFAULT 'submitted'
                                   CONSTRAINT rcr_status_check CHECK (status IN (
                                     'submitted','approved','rejected',
                                     'consent_requested','consent_given','consent_denied',
                                     'fulfilled','declined','expired'
                                   )),
  verification_token             UUID        UNIQUE DEFAULT gen_random_uuid(),
  verification_token_expires_at  TIMESTAMPTZ,
  consent_token                  UUID        UNIQUE,
  consent_token_expires_at       TIMESTAMPTZ,
  consent_resend_count           INT         NOT NULL DEFAULT 0,
  consent_reminder_count         INT         NOT NULL DEFAULT 0,
  consent_last_reminded_at       TIMESTAMPTZ,
  consent_requested_at           TIMESTAMPTZ,
  consent_responded_at           TIMESTAMPTZ,
  admin_note                     TEXT,
  resend_note                    TEXT,
  fulfilled_at                   TIMESTAMPTZ,
  declined_at                    TIMESTAMPTZ,
  expires_at                     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rcr_referee_id         ON referee_contact_requests (referee_id);
CREATE INDEX IF NOT EXISTS idx_rcr_status             ON referee_contact_requests (status);
CREATE INDEX IF NOT EXISTS idx_rcr_created_at         ON referee_contact_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcr_verification_token ON referee_contact_requests (verification_token)
  WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rcr_consent_token      ON referee_contact_requests (consent_token)
  WHERE consent_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rcr_consent_reminder   ON referee_contact_requests (status, consent_last_reminded_at)
  WHERE status = 'consent_requested';
