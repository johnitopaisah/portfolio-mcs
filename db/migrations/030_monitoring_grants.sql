-- ============================================================
--  Migration 030 — Grant monitoring_user read access to existing
--  application tables now queried by postgres-exporter custom queries
--  (job ingestion, referee requests, notification log, content tables).
--  monitoring_user only has pg_monitor's built-in visibility into
--  Postgres's own internal stats by default — it has no access to
--  application tables until granted explicitly (same gap found and
--  fixed for auth_attempts in migration 028).
--  Safe to re-run: GRANT is idempotent.
--  Apply:
--    kubectl exec -n portfolio portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/030_monitoring_grants.sql
-- ============================================================

GRANT SELECT ON job_ingestion_logs          TO monitoring_user;
GRANT SELECT ON jobs_raw                    TO monitoring_user;
GRANT SELECT ON jobs                        TO monitoring_user;
GRANT SELECT ON referee_contact_requests    TO monitoring_user;
GRANT SELECT ON notification_log            TO monitoring_user;
GRANT SELECT ON projects                    TO monitoring_user;
GRANT SELECT ON skills                      TO monitoring_user;
GRANT SELECT ON certifications              TO monitoring_user;
GRANT SELECT ON experiences                 TO monitoring_user;
GRANT SELECT ON education                   TO monitoring_user;
