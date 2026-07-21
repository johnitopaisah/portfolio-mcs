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

// A single low-count warning is expected background noise — any one
// company's hiring can dry up on its own schedule. Two or more at once is
// far less likely to be coincidental and is worth paging on, same as any
// critical failure.
const WARNING_QUORUM = 2;

async function main() {
  console.log('[Canary] Running ATS parser contract checks…');
  const results = await runCanaryChecks();

  for (const r of results) {
    const icon = r.ok ? '✅' : r.severity === 'critical' ? '❌' : '⚠️';
    console.log(`${icon} ${r.platform}/${r.slug}: ${r.reason}`);
  }

  const critical = results.filter((r) => !r.ok && r.severity === 'critical');
  const warnings = results.filter((r) => !r.ok && r.severity === 'warning');

  if (critical.length > 0) {
    console.error(`\n[Canary] ${critical.length}/${results.length} platform(s) failed with a likely parser regression.`);
    process.exit(1);
  }

  if (warnings.length >= WARNING_QUORUM) {
    console.error(`\n[Canary] ${warnings.length}/${results.length} platforms reported low job counts at once — unlikely to be coincidental, treating as a failure.`);
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn(`\n[Canary] ${warnings.length}/${results.length} platform(s) reported a low job count — likely that company's hiring activity, not a parser bug. Not failing the run.`);
  } else {
    console.log(`\n[Canary] All ${results.length} platform(s) passed.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[Canary] Fatal error running checks:', err);
  process.exit(1);
});
