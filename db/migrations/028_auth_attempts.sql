-- ============================================================
--  Migration 028 — Auth attempts audit log
--  Permanent record of every login attempt, for brute-force detection.
--  Prometheus's portfolio_auth_attempts_total counter resets on every API
--  restart and only retains 30 days regardless — this table is the
--  durable source of truth security queries should actually run against.
--  Safe to re-run: CREATE ... IF NOT EXISTS
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/028_auth_attempts.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS auth_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  username     TEXT        NOT NULL,
  result       TEXT        NOT NULL CHECK (result IN ('success', 'failure')),
  ip_address   TEXT,
  user_agent   TEXT
);

-- Both brute-force queries filter by one of these plus a time range —
-- "how many failures from this IP recently" and "how many failures
-- against this username recently".
CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_time       ON auth_attempts (ip_address, attempted_at);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_username_time ON auth_attempts (username, attempted_at);

-- monitoring_user (pg_monitor — see the false-DB-alert fix earlier) only
-- has visibility into Postgres's own internal stats views by default, not
-- application tables. postgres-exporter's custom brute-force queries
-- connect as this role, so it needs explicit read access here.
GRANT SELECT ON auth_attempts TO monitoring_user;
