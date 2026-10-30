'use strict';
require('dotenv').config();
const pool = require('../db/client');
const { rollupOldClicks, RETENTION_DAYS } = require('../services/blogClickService');

async function runBlogClickRollupWorker() {
  console.log('[BlogClickRollup] Starting…', new Date().toISOString());
  const { rolledUp } = await rollupOldClicks();
  console.log(`[BlogClickRollup] Done — ${rolledUp} clicks older than ${RETENTION_DAYS} days moved to daily totals`);
}

setTimeout(() => { console.error('[BlogClickRollup] Timeout'); process.exit(1); }, 5 * 60 * 1000);
process.on('SIGTERM', () => process.exit(0));

runBlogClickRollupWorker()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(err => { console.error('[BlogClickRollup] Fatal:', err); process.exit(1); });
