'use strict';

const pool = require('./db/client');
const searxng = require('./discovery/searxng');
const linkedin = require('./discovery/linkedin');
const { matchesLocation } = require('./locationFilter');
const { matchesPostedWithin } = require('./postedWithinFilter');
const { calculateDeduplicationHash } = require('./dedupHash');

// Adding a new structured ATS platform is just one more entry here — no
// other pipeline code needs to change. Each parser exports the same
// { extractBoardSlug(url), fetchBoardJobs(slug) } interface.
const PLATFORMS = {
  greenhouse: { parser: require('./parsers/greenhouse'), siteFilter: 'site:boards.greenhouse.io' },
  lever:      { parser: require('./parsers/lever'),      siteFilter: 'site:jobs.lever.co' },
  ashby:      { parser: require('./parsers/ashby'),       siteFilter: 'site:jobs.ashbyhq.com' },
  workday:    { parser: require('./parsers/workday'),    siteFilter: 'site:myworkdayjobs.com' },
};

async function loadActiveTargets() {
  const { rows } = await pool.query(
    `SELECT id, role_query, locations, posted_within_days FROM job_targets WHERE is_active = TRUE`
  );
  return rows;
}

// Search-driven discovery: for each active target, query every known ATS
// platform and register any new boards found. Boards already known are left
// alone — this step only ever adds rows, polling happens separately below.
async function discoverBoards(targets) {
  let discovered = 0;

  for (const target of targets) {
    for (const [platformKey, { parser, siteFilter }] of Object.entries(PLATFORMS)) {
      const query = `${target.role_query} ${siteFilter}`;
      const results = await searxng.search(query);

      const slugs = new Set();
      for (const r of results) {
        const slug = parser.extractBoardSlug(r.url);
        if (slug) slugs.add(slug);
      }

      for (const slug of slugs) {
        const { rowCount } = await pool.query(
          `INSERT INTO known_boards (ats_platform, board_slug, first_discovered_via)
           VALUES ($1, $2, $3)
           ON CONFLICT (ats_platform, board_slug) DO NOTHING`,
          [platformKey, slug, target.role_query]
        );
        discovered += rowCount;
      }
    }
  }

  return discovered;
}

// Polls every known board directly via its platform's structured API — no
// search spent on boards we already know about. This is what makes the
// registry shrink discovery cost over time.
async function pollKnownBoards(targetsByRoleQuery) {
  const { rows: boards } = await pool.query(
    `SELECT ats_platform, board_slug, first_discovered_via FROM known_boards`
  );

  const results = [];
  for (const board of boards) {
    const platform = PLATFORMS[board.ats_platform];
    if (!platform) {
      console.warn(`[Pipeline] Unknown ats_platform "${board.ats_platform}" — skipping`);
      continue;
    }

    let jobs;
    try {
      jobs = await platform.parser.fetchBoardJobs(board.board_slug);
    } catch (err) {
      console.error(`[Pipeline] Failed to poll ${board.ats_platform}/"${board.board_slug}":`, err.message);
      continue;
    }

    if (jobs === null) continue; // board no longer exists

    await pool.query(
      `UPDATE known_boards SET last_polled_at = NOW(), last_yield_count = $3
       WHERE ats_platform = $1 AND board_slug = $2`,
      [board.ats_platform, board.board_slug, jobs.length]
    );

    // Best-effort mapping back to the target that discovered this board, so
    // we know which location/recency constraints to filter against. If that
    // target was since renamed/paused, fall back to no constraint rather than
    // silently dropping jobs over bookkeeping drift.
    const target = targetsByRoleQuery.get(board.first_discovered_via);
    results.push({
      atsPlatform: board.ats_platform,
      slug: board.board_slug,
      jobs,
      locations: target?.locations || [],
      postedWithinDays: target?.posted_within_days ?? null,
    });
  }

  return results;
}

// LinkedIn has no structured API and no "board" to poll for free — every
// lead comes straight from a fresh search each run. Shaped identically to
// pollKnownBoards()'s output so processBoardResults() can treat it the same.
async function discoverLinkedInLeads(targets) {
  const results = [];
  for (const target of targets) {
    const jobs = await linkedin.discoverLeads(target);
    results.push({
      atsPlatform: 'linkedin',
      slug: null,
      jobs,
      locations: target.locations || [],
      postedWithinDays: target.posted_within_days ?? null,
    });
  }
  return results;
}

// Cheapest gate first: has this URL already been considered? Insert into
// crawl_seen_urls either way so a rejected posting isn't re-evaluated next run.
async function markSeen(url) {
  const { rowCount } = await pool.query(
    `INSERT INTO crawl_seen_urls (url) VALUES ($1) ON CONFLICT (url) DO NOTHING`,
    [url]
  );
  return rowCount > 0; // true if this is the first time we've seen it
}

async function storeRawJob(job) {
  const hash = calculateDeduplicationHash(job.title, job.company_name, job.location);
  const { rowCount } = await pool.query(
    `INSERT INTO jobs_raw (
       external_id, company_name, title, location, job_type,
       description, requirements, salary_min, salary_max, salary_currency,
       posted_at, apply_url, source_api, dedup_hash, raw_data
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (external_id) DO NOTHING`,
    [
      job.external_id, job.company_name, job.title, job.location, job.job_type,
      job.description, job.requirements, job.salary_min, job.salary_max, job.salary_currency,
      job.posted_at, job.apply_url, job.source_api, hash, JSON.stringify(job.raw_data || {}),
    ]
  );
  return rowCount > 0;
}

function emptyStats() {
  return { fetched: 0, new: 0, locationFiltered: 0, staleFiltered: 0, alreadySeen: 0, errors: 0 };
}

// Returns stats per platform (ats_platform -> stats) so each gets its own
// job_ingestion_logs row, same as each old job-board provider used to.
async function processBoardResults(boardResults) {
  const statsByPlatform = {};

  for (const { atsPlatform, jobs, locations, postedWithinDays } of boardResults) {
    const stats = (statsByPlatform[atsPlatform] ??= emptyStats());

    for (const job of jobs) {
      stats.fetched += 1;

      const isNewUrl = await markSeen(job.apply_url);
      if (!isNewUrl) {
        stats.alreadySeen += 1;
        continue;
      }

      if (!matchesLocation(job.location, locations)) {
        stats.locationFiltered += 1;
        continue;
      }

      if (!matchesPostedWithin(job.posted_at, postedWithinDays)) {
        stats.staleFiltered += 1;
        continue;
      }

      // One malformed row (unexpected null, a constraint violation, etc.)
      // must not sink the entire run's progress — log and move on, same
      // resilience the old system's per-job scoring loop already has.
      try {
        const inserted = await storeRawJob(job);
        if (inserted) stats.new += 1;
      } catch (err) {
        stats.errors += 1;
        console.error(`[Pipeline] Failed to store "${job.external_id}":`, err.message);
      }
    }
  }

  return statsByPlatform;
}

async function recordIngestionLog(atsPlatform, stats, durationMs, error) {
  await pool.query(
    `INSERT INTO job_ingestion_logs (
       source_api, status, jobs_fetched, jobs_new, jobs_duplicates, jobs_filtered,
       error_message, duration_ms, completed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    [
      `${atsPlatform}_search`,
      error ? 'FAILED' : 'SUCCESS',
      stats.fetched,
      stats.new,
      stats.alreadySeen,
      stats.locationFiltered + stats.staleFiltered,
      error ? String(error.message || error) : null,
      durationMs,
    ]
  );
}

async function run() {
  const t0 = Date.now();

  try {
    const targets = await loadActiveTargets();
    console.log(`[Pipeline] ${targets.length} active target(s)`);

    const targetsByRoleQuery = new Map(targets.map((t) => [t.role_query, t]));

    const discovered = await discoverBoards(targets);
    console.log(`[Pipeline] Discovered ${discovered} new board(s)`);

    const boardResults = await pollKnownBoards(targetsByRoleQuery);
    console.log(`[Pipeline] Polled ${boardResults.length} known board(s)`);

    const linkedInResults = await discoverLinkedInLeads(targets);
    console.log(`[Pipeline] Found ${linkedInResults.reduce((n, r) => n + r.jobs.length, 0)} LinkedIn lead(s)`);

    const statsByPlatform = await processBoardResults([...boardResults, ...linkedInResults]);
    console.log('[Pipeline] Result by platform:', statsByPlatform);

    const durationMs = Date.now() - t0;
    for (const [platform, stats] of Object.entries(statsByPlatform)) {
      await recordIngestionLog(platform, stats, durationMs, null);
    }

    return statsByPlatform;
  } catch (err) {
    await recordIngestionLog('unknown', emptyStats(), Date.now() - t0, err);
    throw err;
  }
}

module.exports = { run };
