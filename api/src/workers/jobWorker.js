#!/usr/bin/env node
'use strict';
/**
 * Job Ingestion & Filtering Worker
 * Runs via Kubernetes CronJob every 8 hours.
 * Steps: ingest → AI filter → notify → expire → purge → backup
 */

require('dotenv').config();

const { exec }             = require('child_process');
const fs                   = require('fs');
const os                   = require('os');
const path                 = require('path');

const jobIngestionService  = require('../services/jobIngestion/jobIngestionService');
const aiFilteringService   = require('../services/jobIngestion/aiFilteringService');
const notificationService  = require('../services/jobIngestion/notificationService');
const pool                 = require('../db/client');

const WORKER_TIMEOUT    = 30 * 60 * 1000; // 30 min hard limit
const BACKUP_KEEP       = 3;               // number of backup files to retain
const CRON_INTERVAL_H   = 8;              // must match the CronJob schedule

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
    console.log('\n[Worker:1] Ingesting from all providers…');
    const ingestion = await jobIngestionService.ingestAllJobs();
    console.log('[Worker:1] Done:', ingestion);

    // Step 2: AI filter new raw jobs
    console.log('\n[Worker:2] Running AI filtering…');
    const filtering = await aiFilteringService.filterUnprocessedJobs();
    console.log('[Worker:2] Done:', filtering);

    // Step 3: Send run digest — fires on every successful run
    console.log('\n[Worker:3] Sending job run digest…');
    const notification = await notificationService.sendWorkerRunDigest(CRON_INTERVAL_H);
    console.log('[Worker:3] Done:', notification);

    // Step 4: Expire stale jobs
    console.log('\n[Worker:4] Expiring old jobs…');
    const expired = await jobIngestionService.markExpiredJobs();
    console.log(`[Worker:4] Done: ${expired} expired`);

    // Step 5: Hard-delete jobs older than 14 days (applied/interested history kept)
    console.log('\n[Worker:5] Purging jobs older than 14 days…');
    const purged = await jobIngestionService.purgeOldJobs();
    console.log(`[Worker:5] Done: ${purged.jobs} jobs, ${purged.raw} raw rows removed`);

    // Step 6: Full database backup → ~/db-backups, keep last 3
    // Non-fatal: a backup failure must not undo the ingest/filter/notify work above.
    console.log('\n[Worker:6] Running database backup…');
    try {
      const backup = await runDatabaseBackup();
      console.log(`[Worker:6] Done: ${backup.file} (${backup.kept} kept, ${backup.pruned} pruned)`);
    } catch (backupErr) {
      console.error('[Worker:6] Backup failed (non-fatal):', backupErr.message);
    }

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

// ── Database backup ───────────────────────────────────────────
async function runDatabaseBackup() {
  const backupDir = path.join(os.homedir(), 'db-backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const ts      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // 2026-05-18T10-00-00
  const outFile = path.join(backupDir, `backup-${ts}.sql.gz`);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is not set — cannot run backup');

  await new Promise((resolve, reject) => {
    // Shell pipeline avoids streaming to Node memory; gzip compresses in-flight
    exec(
      `pg_dump "${dbUrl}" --no-password | gzip > "${outFile}"`,
      { timeout: 25 * 60 * 1000 }, // 25 min max for large dumps
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`pg_dump failed: ${stderr || err.message}`));
        } else {
          resolve();
        }
      }
    );
  });

  // Prune oldest files — keep only BACKUP_KEEP most recent
  const allFiles = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('backup-') && f.endsWith('.sql.gz'))
    .sort(); // ISO filenames sort lexicographically = chronologically

  const toDelete = allFiles.slice(0, Math.max(0, allFiles.length - BACKUP_KEEP));
  toDelete.forEach(f => {
    try { fs.unlinkSync(path.join(backupDir, f)); }
    catch (_) {}
  });

  return {
    file:   outFile,
    kept:   Math.min(allFiles.length, BACKUP_KEEP),
    pruned: toDelete.length,
  };
}

setTimeout(() => {
  console.error('[Worker] Hard timeout (30 min). Exiting.');
  process.exit(1);
}, WORKER_TIMEOUT);

process.on('SIGTERM', () => { console.log('[Worker] SIGTERM'); process.exit(0); });
process.on('SIGINT',  () => { console.log('[Worker] SIGINT');  process.exit(0); });

runJobWorker();
