-- ============================================================
--  Migration 026 — Per-board circuit breaker
--  Safe to re-run: ADD COLUMN IF NOT EXISTS
--  Apply:
--    kubectl exec -n portfolio sts/portfolio-db-0 -i -- \
--      psql -U portfolio_user -d portfolio_db \
--      < db/migrations/026_board_circuit_breaker.sql
-- ============================================================

-- Tracks repeated poll failures per board (timeouts, 5xx, network errors —
-- not a normal "board removed" 404/422, which already short-circuits
-- separately). A board backed off after too many consecutive failures is
-- skipped for a while rather than retried every single run forever.
ALTER TABLE known_boards
  ADD COLUMN IF NOT EXISTS consecutive_failures INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS backoff_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_known_boards_backoff ON known_boards (backoff_until)
  WHERE backoff_until IS NOT NULL;
