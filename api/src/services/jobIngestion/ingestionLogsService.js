/**
 * Job Ingestion Logs Service
 * Tracks ingestion runs for observability and monitoring
 */

const pool = require('../../db/client');

/**
 * Record an ingestion run in the database
 */
async function recordIngestionLog(
  sourceApi,
  status,
  jobsFetched,
  jobsNew,
  jobsDuplicates,
  jobsFiltered,
  errorMessage,
  durationMs
) {
  const query = `
    INSERT INTO job_ingestion_logs (
      source_api,
      status,
      jobs_fetched,
      jobs_new,
      jobs_duplicates,
      jobs_filtered,
      error_message,
      duration_ms
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8
    )
    RETURNING id;
  `;

  const values = [
    sourceApi,
    status,
    jobsFetched,
    jobsNew,
    jobsDuplicates,
    jobsFiltered,
    errorMessage,
    durationMs,
  ];

  const result = await pool.query(query, values);
  return result.rows[0]?.id;
}

/**
 * Get last successful ingestion run for a provider
 */
async function getLastSuccessfulRun(sourceApi) {
  const query = `
    SELECT * FROM job_ingestion_logs
    WHERE source_api = $1 AND status = 'SUCCESS'
    ORDER BY completed_at DESC
    LIMIT 1;
  `;

  const result = await pool.query(query, [sourceApi]);
  return result.rows[0] || null;
}

/**
 * Get ingestion statistics for the last N hours
 */
async function getIngestionStats(hoursBack = 24) {
  const query = `
    SELECT
      source_api,
      COUNT(*) as runs,
      SUM(jobs_fetched) as total_fetched,
      SUM(jobs_new) as total_new,
      SUM(jobs_duplicates) as total_duplicates,
      AVG(duration_ms) as avg_duration_ms,
      COUNT(CASE WHEN status = 'SUCCESS' THEN 1 END) as successful_runs,
      COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_runs
    FROM job_ingestion_logs
    WHERE created_at > NOW() - INTERVAL '1 hour' * $1
    GROUP BY source_api
    ORDER BY created_at DESC;
  `;

  const result = await pool.query(query, [hoursBack]);
  return result.rows;
}

/**
 * Get recent ingestion logs with pagination
 */
async function getRecentLogs(limit = 50, offset = 0) {
  const query = `
    SELECT * FROM job_ingestion_logs
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2;
  `;

  const result = await pool.query(query, [limit, offset]);
  return result.rows;
}

/**
 * Mark ingestion as completed with end time
 */
async function markIngestionComplete(logId) {
  const query = `
    UPDATE job_ingestion_logs
    SET completed_at = NOW()
    WHERE id = $1;
  `;

  await pool.query(query, [logId]);
}

module.exports = {
  recordIngestionLog,
  getLastSuccessfulRun,
  getIngestionStats,
  getRecentLogs,
  markIngestionComplete,
};
