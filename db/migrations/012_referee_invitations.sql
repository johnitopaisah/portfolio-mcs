CREATE TABLE IF NOT EXISTS referee_invitations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        UNIQUE NOT NULL,
  note        TEXT,
  type        TEXT        NOT NULL DEFAULT 'create', -- 'create' | 'modify'
  referee_id  UUID        REFERENCES referees(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN     NOT NULL DEFAULT false,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referee_invitations_token_idx ON referee_invitations(token);

ALTER TABLE referees
  ADD COLUMN IF NOT EXISTS modification_requested    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS modification_requested_at TIMESTAMPTZ;
