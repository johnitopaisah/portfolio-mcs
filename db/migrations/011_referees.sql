CREATE TABLE IF NOT EXISTS referees (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  title                TEXT        NOT NULL,
  organization         TEXT        NOT NULL,
  relationship         TEXT        NOT NULL,
  review               TEXT,
  linkedin_url         TEXT,
  email                TEXT,
  phone                TEXT,
  available_on_request BOOLEAN     NOT NULL DEFAULT true,
  photo                BYTEA,
  photo_mime           TEXT,
  org_logo             BYTEA,
  org_logo_mime        TEXT,
  order_index          INTEGER     NOT NULL DEFAULT 0,
  visible              BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_referees_updated_at
  BEFORE UPDATE ON referees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
