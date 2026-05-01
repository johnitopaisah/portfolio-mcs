#!/usr/bin/env node
/**
 * Job Ingestion & Filtering Worker
 * Run this via:
 * - Node: node src/workers/jobWorker.js
 * - Docker: node src/workers/jobWorker.js
 * - Kubernetes CronJob: every 15 minutes
 */

require('dotenv').config();

const jobIngestionService = require('../services/jobIngestion/jobIngestionService');
const aiFilteringService = require('../services/jobIngestion/aiFilteringService');
const notificationService = require('../services/jobIngestion/notificationService');
const pool = require('../db/client');

const WORKER_TIMEOUT = 30 * 60 * 1000; // 30 minutes max

async function runJobWorker() {
  console.log('[Worker] ========================================');
  console.log('[Worker] Starting job ingestion worker...');
  console.log('[Worker] Time:', new Date().toISOString());
  console.log('[Worker] ========================================');

  const startTime = Date.now();

  try {
    // Step 1: Ingest jobs from all providers
    console.log('\n[Worker:Step1] Ingesting jobs from APIs...');
    const ingestionResults = await jobIngestionService.ingestAllJobs();
    console.log('[Worker:Step1] Complete:', JSON.stringify(ingestionResults, null, 2));

    // Step 2: AI filtering of new jobs
    console.log('\n[Worker:Step2] Running AI filtering...');
    const filteringResults = await aiFilteringService.filterUnprocessedJobs();
    console.log('[Worker:Step2] Complete:', JSON.stringify(filteringResults, null, 2));

    // Step 3: Send alerts for new relevant jobs
    console.log('\n[Worker:Step3] Sending job alerts...');
    const notificationResults = await notificationService.sendNewJobAlerts();
    console.log('[Worker:Step3] Complete:', JSON.stringify(notificationResults, null, 2));

    // Step 4: Cleanup expired jobs
    console.log('\n[Worker:Step4] Marking expired jobs...');
    const expiredCount = await jobIngestionService.markExpiredJobs();
    console.log('[Worker:Step4] Complete: Marked', expiredCount, 'jobs as expired');

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('\n[Worker] ========================================');
    console.log('[Worker] ✅ Worker completed successfully!');
    console.log('[Worker] Duration:', duration, 'seconds');
    console.log('[Worker] ========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n[Worker] ❌ Worker failed with error:');
    console.error(error);

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('\n[Worker] Duration:', duration, 'seconds');
    console.log('[Worker] ========================================\n');

    process.exit(1);
  } finally {
    // Close database connection
    try {
      await pool.end();
      console.log('[Worker] Database connection closed');
    } catch (error) {
      console.error('[Worker] Failed to close database:', error.message);
    }
  }
}

// Set a hard timeout to prevent hanging
setTimeout(() => {
  console.error('[Worker] Hard timeout reached (30 minutes). Exiting...');
  process.exit(1);
}, WORKER_TIMEOUT);

// Handle signals
process.on('SIGTERM', () => {
  console.log('[Worker] SIGTERM received, gracefully shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] SIGINT received, gracefully shutting down...');
  process.exit(0);
});

// Run the worker
runJobWorker();
