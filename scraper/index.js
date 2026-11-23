#!/usr/bin/env node
'use strict';
/**
 * Career-site job discovery worker (Phase 1: Greenhouse only).
 * Run standalone via `node index.js`, or on a schedule once k8s manifests
 * land in a later phase.
 */

require('dotenv').config();

const pipeline = require('./src/pipeline');
const pool = require('./src/db/client');
const metrics = require('./src/metrics');

// Matches the k8s CronJob's activeDeadlineSeconds (3600s) — must not exceed it,
// but shouldn't be much shorter either. Workday boards cost meaningfully more
// per poll than Greenhouse/Lever/Ashby (separate list + per-job detail
// requests), so 10 min proved too tight once Workday was added, and 28 min
// stopped being enough once the known_boards registry grew past ~500 boards
// (runs were completing in ~27.7 min, right at that ceiling — see
// pipeline.js's POLL_CONCURRENCY, bumped alongside this).
const WORKER_TIMEOUT = 55 * 60 * 1000; // 55 min — leaves headroom under k8s's 60 min deadline

async function main() {
  console.log('[Scraper] ================================');
  console.log('[Scraper] Discovery run starting…');
  console.log('[Scraper] Time:', new Date().toISOString());
  console.log('[Scraper] SearXNG:',
    process.env.SEARXNG_URL ? `${process.env.SEARXNG_URL}` : 'NOT SET — discovery will be skipped');
  console.log('[Scraper] ================================\n');

  // Availability "Not open" (admin dashboard) pauses the whole job search,
  // discovery included. Any error (e.g. column missing) means: run as usual.
  try {
    const { rows } = await pool.query('SELECT availability_status FROM profile LIMIT 1');
    if (rows[0]?.availability_status === 'not_open') {
      console.log('[Scraper] Job search paused (availability: Not open) — skipping this run');
      return;
    }
  } catch (err) {
    console.warn('[Scraper] Could not read availability — running as usual:', err.message);
  }

  const t0 = Date.now();
  await pipeline.run();
  console.log(`\n[Scraper] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

const timeout = setTimeout(() => {
  console.error('[Scraper] Hard timeout reached — exiting');
  process.exit(1);
}, WORKER_TIMEOUT);
timeout.unref();

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Scraper] Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    // Push before closing the DB pool — this pod exits right after,
    // and Prometheus's next scrape will never reach it directly.
    await metrics.pushMetrics('scraper-discovery');
    await pool.end();
  });
