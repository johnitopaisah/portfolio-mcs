'use strict';
/**
 * Job Ingestion Service
 * Raw job fetching now lives in scraper/ (career-site discovery via SearXNG +
 * structured ATS parsers). This service retains only the lifecycle steps that
 * apply to every job regardless of which pipeline discovered it.
 */

const pool   = require('../../db/client');
const config = require('./config');

class JobIngestionService {

  // ── Expire old jobs ────────────────────────────────────────
  // Keyed on created_at (when *we* discovered the job), not posted_at (the
  // job's own real-world posting date). ATS-sourced postings (Greenhouse/
  // Lever/Ashby) legitimately preserve old original posting dates for
  // listings that are still open — keying expiry off posted_at meant such a
  // job could already be past the cutoff the instant it was first scored,
  // getting expired/purged in the very same run that discovered it. Every
  // job now gets a genuine full window measured from when it entered the
  // system, regardless of how old the underlying posting is.
  async markExpiredJobs() {
    const maxAge = config.jobFiltering.maxAgeHours;
    const result = await pool.query(
      `UPDATE jobs SET is_active = FALSE, expires_at = NOW()
       WHERE is_active = TRUE AND created_at < NOW() - INTERVAL '1 hour' * $1`,
      [maxAge]
    );
    console.log(`[JobIngestion] Expired ${result.rowCount} old jobs`);
    return result.rowCount;
  }

  // ── Hard-delete jobs older than 14 days ────────────────────
  // Protects jobs with applied/interested feedback (user's history).
  // ON DELETE CASCADE on job_feedback means child rows are deleted automatically.
  // See markExpiredJobs() comment above — keyed on created_at, not posted_at,
  // for the same reason (was causing an immediate process-then-purge loop
  // for any job whose real posting date was already >14 days old at discovery).
  async purgeOldJobs() {
    const deleteJobs = await pool.query(
      `DELETE FROM jobs
       WHERE created_at < NOW() - INTERVAL '14 days'
         AND NOT EXISTS (
           SELECT 1 FROM job_feedback jf
           WHERE jf.job_id = jobs.id
             AND jf.decision IN ('applied', 'interested')
         )
       RETURNING job_raw_id`
    );

    // Clean up jobs_raw rows that are now orphaned (no jobs row references them)
    const deleteRaw = await pool.query(
      `DELETE FROM jobs_raw
       WHERE created_at < NOW() - INTERVAL '14 days'
         AND NOT EXISTS (
           SELECT 1 FROM jobs j WHERE j.job_raw_id = jobs_raw.id
         )`
    );

    console.log(`[JobIngestion] Purged ${deleteJobs.rowCount} old jobs, ${deleteRaw.rowCount} raw rows`);
    return { jobs: deleteJobs.rowCount, raw: deleteRaw.rowCount };
  }
}

module.exports = new JobIngestionService();
