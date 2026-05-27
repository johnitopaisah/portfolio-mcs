ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'active'
    CONSTRAINT availability_status_check
      CHECK (availability_status IN ('active', 'passive', 'not_open'));
