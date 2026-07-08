#!/usr/bin/env node
'use strict';
/**
 * Standalone canary/contract check runner. Exits non-zero if any ATS
 * parser's known-good reference board fails its shape check — surfaced via
 * the k8s CronJob's own failure tracking (kubectl get cronjob/jobs), same
 * as any other failed Job, rather than needing separate alerting plumbing.
 * Deliberately independent of the main discovery pipeline (scraper/index.js)
 * — this re-checks fixed, known-good boards every time, not whatever's
 * currently in known_boards.
 */

// No dotenv/config needed — canary checks call the public ATS APIs
// directly, no DB or secrets involved.
const { runCanaryChecks } = require('../src/canary');

async function main() {
  console.log('[Canary] Running ATS parser contract checks…');
  const results = await runCanaryChecks();

  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`${icon} ${r.platform}/${r.slug}: ${r.reason}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n[Canary] ${failed.length}/${results.length} platform(s) failed their contract check.`);
    process.exit(1);
  }

  console.log(`\n[Canary] All ${results.length} platform(s) passed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[Canary] Fatal error running checks:', err);
  process.exit(1);
});
