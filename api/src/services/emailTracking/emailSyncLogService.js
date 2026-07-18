'use strict';
/**
 * Email Sync Logs Service
 * Tracks per-mailbox sync runs for observability — powers the
 * "last synced / last error" health badge on the email tracking dashboard.
 */

const pool = require('../../db/client');

async function logSyncResult({ sourceAccount, status, emailsFetched = 0, emailsNew = 0, errorMessage = null, durationMs = null }) {
  await pool.query(
    `INSERT INTO email_sync_logs (source_account, status, emails_fetched, emails_new, error_message, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sourceAccount, status, emailsFetched, emailsNew, errorMessage, durationMs]
  );
}

async function getLatestStatusBySource() {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (source_account) *
    FROM email_sync_logs
    ORDER BY source_account, created_at DESC
  `);
  return rows;
}

module.exports = { logSyncResult, getLatestStatusBySource };
