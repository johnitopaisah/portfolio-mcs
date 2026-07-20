-- ============================================================
--  Migration 029 — LLM request audit log
--  Permanent record of every AI scoring call (Claude/Groq/Gemini),
--  independent of Prometheus's 30-day retention. Confirmed via repo audit
--  that llm_requests_total/llm_tokens_total/llm_estimated_cost_usd_total
--  had zero DB backing before this — AI spend history was otherwise
--  unrecoverable once it aged out of Prometheus.
--  Safe to re-run: CREATE ... IF NOT EXISTS
--  Apply:
--    kubectl exec -n portfolio portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/029_llm_requests_log.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS llm_requests_log (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  provider           TEXT          NOT NULL,   -- claude | groq | gemini
  status             TEXT          NOT NULL CHECK (status IN ('success', 'failed')),
  prompt_tokens      INT,
  completion_tokens  INT,
  estimated_cost_usd NUMERIC(12,6),
  duration_ms        INT,
  error_message      TEXT,
  requested_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_requests_log_provider_time ON llm_requests_log (provider, requested_at);

GRANT SELECT ON llm_requests_log TO monitoring_user;
