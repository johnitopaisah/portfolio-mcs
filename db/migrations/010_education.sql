CREATE TABLE IF NOT EXISTS education (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution     TEXT        NOT NULL,
  institution_url TEXT,
  degree          TEXT        NOT NULL,
  field_of_study  TEXT        NOT NULL,
  description     TEXT,
  grade           TEXT,
  activities      TEXT,
  start_date      DATE        NOT NULL,
  end_date        DATE,
  ongoing         BOOLEAN     NOT NULL DEFAULT false,
  logo            BYTEA,
  logo_mime       TEXT,
  order_index     INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_education_updated_at
  BEFORE UPDATE ON education
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
