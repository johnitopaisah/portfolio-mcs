#!/usr/bin/env node
'use strict';
/**
 * Job Ingestion & Filtering Worker
 * Runs via Kubernetes CronJob every 15 minutes.
 * Steps: ingest → AI filter → send digest → expire old jobs
 */

require('dotenv').config();

const jobIngestionService  = require('../services/jobIngestion/jobIngestionService');
const aiFilteringService   = require('../services/jobIngestion/aiFilteringService');
const notificationService  = require('../services/jobIngestion/notificationService');
const pool                 = require('../db/client');

const WORKER_TIMEOUT = 30 * 60 * 1000; // 30 min hard limit

async function runJobWorker() {
  console.log('[Worker] ======================================');
  console.log('[Worker] Job worker starting…');
  console.log('[Worker] Time:', new Date().toISOString());
  console.log('[Worker] LLM engine: Claude Haiku (ANTHROPIC_API_KEY',
    process.env.ANTHROPIC_API_KEY ? 'SET ✅' : 'NOT SET — using pattern fallback ⚠️', ')');
  console.log('[Worker] Adzuna:', process.env.ADZUNA_APP_ID ? 'enabled ✅' : 'disabled ⚠️');
  console.log('[Worker] ======================================\n');

  const t0 = Date.now();

  try {
    // Step 1: Ingest from all providers
    console.log('\n[Worker:1] Ingesting from Jooble / RemoteOK / Adzuna…');
    const ingestion = await jobIngestionService.ingestAllJobs();
    console.log('[Worker:1] Done:', ingestion);

    // Step 2: AI filter new raw jobs
    console.log('\n[Worker:2] Running AI filtering…');
    const filtering = await aiFilteringService.filterUnprocessedJobs();
    console.log('[Worker:2] Done:', filtering);

    // Step 3: Send daily digest (only fires at scheduled time, not every run)
    // The notificationService.sendNewJobAlerts() is a no-op outside digest time
    // because sendJobDigest() is scheduled via startJobDigest() in index.js.
    // Here we only send if the FORCE_DIGEST env var is set (for manual testing).
    if (process.env.FORCE_DIGEST === 'true') {
      console.log('\n[Worker:3] Sending job digest (FORCE_DIGEST=true)…');
      const notification = await notificationService.sendNow();
      console.log('[Worker:3] Done:', notification);
    } else {
      console.log('\n[Worker:3] Digest skipped (handled by scheduler in API process)');
    }

    // Step 4: Expire stale jobs
    console.log('\n[Worker:4] Expiring old jobs…');
    const expired = await jobIngestionService.markExpiredJobs();
    console.log(`[Worker:4] Done: ${expired} expired`);

    const secs = Math.round((Date.now() - t0) / 1000);
    console.log(`\n[Worker] ✅ Completed in ${secs}s`);
    console.log('[Worker] ======================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n[Worker] ❌ Fatal error:', err);
    process.exit(1);
  } finally {
    try { await pool.end(); }
    catch (_) {}
  }
}

setTimeout(() => {
  console.error('[Worker] Hard timeout (30 min). Exiting.');
  process.exit(1);
}, WORKER_TIMEOUT);

process.on('SIGTERM', () => { console.log('[Worker] SIGTERM'); process.exit(0); });
process.on('SIGINT',  () => { console.log('[Worker] SIGINT');  process.exit(0); });

runJobWorker();
