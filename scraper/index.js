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

// Matches the k8s CronJob's activeDeadlineSeconds (1800s) — must not exceed it,
// but shouldn't be much shorter either. Workday boards cost meaningfully more
// per poll than Greenhouse/Lever/Ashby (separate list + per-job detail
// requests), so 10 min proved too tight once Workday was added.
const WORKER_TIMEOUT = 28 * 60 * 1000; // 28 min — leaves headroom under k8s's 30 min deadline

async function main() {
  console.log('[Scraper] ================================');
  console.log('[Scraper] Discovery run starting…');
  console.log('[Scraper] Time:', new Date().toISOString());
  console.log('[Scraper] SearXNG:',
    process.env.SEARXNG_URL ? `${process.env.SEARXNG_URL}` : 'NOT SET — discovery will be skipped');
  console.log('[Scraper] ================================\n');

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
  .finally(() => pool.end());
