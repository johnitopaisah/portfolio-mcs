'use strict';

const pool = require('../db/client');
const { sendBlogSyncStaleReminder } = require('../services/notify');

const STALE_THRESHOLD_DAYS = 14;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // run once every 24 hours

// Only ever emails a reminder — never triggers a sync itself.
// Sync stays a deliberate "Sync Now" click in the admin Blog page.
async function runBlogStalenessCheck() {
  try {
    const { rows } = await pool.query(
      `SELECT MAX(ingested_at) AS last_synced FROM blog_posts`
    );
    const lastSynced = rows[0]?.last_synced;
    if (!lastSynced) return; // never synced yet — nothing to remind about

    const daysSinceLastSync = Math.floor((Date.now() - new Date(lastSynced).getTime()) / 86_400_000);
    if (daysSinceLastSync < STALE_THRESHOLD_DAYS) return;

    await sendBlogSyncStaleReminder({ daysSinceLastSync });
  } catch (err) {
    console.error('[BlogStaleness] Check failed:', err.message || err);
  }
}

function startBlogStalenessWorker() {
  runBlogStalenessCheck();
  setInterval(runBlogStalenessCheck, CHECK_INTERVAL_MS);
  console.log('[BlogStaleness] Worker started — checking every 24 hours');
}

module.exports = { startBlogStalenessWorker };
