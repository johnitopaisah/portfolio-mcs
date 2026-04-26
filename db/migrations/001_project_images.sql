-- ============================================================
--  Migration 001: project_images table
--
--  Run on the live cluster BEFORE deploying the new API image:
--
--  kubectl exec -it -n portfolio statefulset/portfolio-db -- \
--    psql -U portfolio_user -d portfolio_db -c "
--      CREATE TABLE IF NOT EXISTS project_images (
--        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
--        project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
--        image       BYTEA       NOT NULL,
--        image_mime  TEXT        NOT NULL,
--        caption     TEXT,
--        order_index INT         NOT NULL DEFAULT 0,
--        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
--      );
--      CREATE INDEX IF NOT EXISTS idx_project_images_project
--        ON project_images (project_id, order_index);
--    "
-- ============================================================

CREATE TABLE IF NOT EXISTS project_images (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  image       BYTEA       NOT NULL,
  image_mime  TEXT        NOT NULL,
  caption     TEXT,
  order_index INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_images_project
  ON project_images (project_id, order_index);
