'use strict';

const crypto = require('crypto');
const pool = require('./db/client');
const searxng = require('./discovery/searxng');
const linkedin = require('./discovery/linkedin');
const customSite = require('./discovery/customSite');
const { fetchPageText } = require('./extraction/fetchPage');
const { extractJobFromPage } = require('./extraction/claudeExtract');
const { matchesLocation } = require('./locationFilter');
const { matchesPostedWithin } = require('./postedWithinFilter');
const { calculateDeduplicationHash } = require('./dedupHash');

// Bounds Claude spend per run, same philosophy as the existing scoring
// pipeline's LLM_CALLS_PER_RUN — cheap tiers (URL-seen check, then a
// cheap pre-filter) run first, so this only gates the genuinely expensive
// step (fetch + Claude extraction) for candidates that already passed both.
const CUSTOM_EXTRACTION_CALLS_PER_RUN = 20;

// Adding a new structured ATS platform is just one more entry here — no
// other pipeline code needs to change. Each parser exports the same
// { extractBoardSlug(url), fetchBoardJobs(slug) } interface.
const PLATFORMS = {
  greenhouse: { parser: require('./parsers/greenhouse'), siteFilter: 'site:boards.greenhouse.io' },
  lever:      { parser: require('./parsers/lever'),      siteFilter: 'site:jobs.lever.co' },
  ashby:      { parser: require('./parsers/ashby'),       siteFilter: 'site:jobs.ashbyhq.com' },
  workday:    { parser: require('./parsers/workday'),    siteFilter: 'site:myworkdayjobs.com' },
  smartrecruiters: { parser: require('./parsers/smartrecruiters'), siteFilter: 'site:careers.smartrecruiters.com' },
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
// After this many consecutive failures (timeouts, 5xx, network errors — not
// a clean "board removed" null return, which is handled separately and
// doesn't count as a failure at all), stop retrying every single run and
// back off for a while instead. Duration scales with failure count so a
// board that keeps failing gets left alone longer, capped at 14 days.
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_MAX_DAYS = 14;

// Each board is a different company's independent ATS endpoint, so several
// can be in flight at once without one slow board (e.g. a multi-MB Lever
// payload) blocking others behind it in a single-file queue. Matches the db
// pool's max connections (db/client.js) — every board's own DB writes are
// brief and release the connection immediately, so this comfortably overlaps
// network I/O wait across boards without starving the pool or hammering
// SearXNG/every ATS at once.
const POLL_CONCURRENCY = 5;

// Runs `worker` over `items` with at most `concurrency` in flight at a time.
// Each of the `concurrency` lanes pulls the next item as soon as it finishes
// its current one, rather than waiting for a whole batch to complete —
// so one slow item only holds up its own lane, not the others.
async function mapWithConcurrency(items, concurrency, worker) {
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}

// Persists one board/target's job batch immediately, accumulating into the
// given stats bucket. Called right after each board is fetched (inside
// pollKnownBoards's own loop) rather than once at the very end of a run —
// a run that gets cut short by the hard timeout (index.js) can only ever
// lose boards it hadn't reached yet, never jobs already fetched. Shared by
// the ATS-board tier and the LinkedIn tier below.
async function storeJobBatch(jobs, locations, postedWithinDays, stats) {
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

// Polls, circuit-breaks, and stores a single board — everything one lane of
// mapWithConcurrency does per item. Returns true if the board was actually
// polled (vs. skipped/failed), so the caller can keep an accurate count.
async function pollOneBoard(board, targetsByRoleQuery, statsByPlatform) {
  const platform = PLATFORMS[board.ats_platform];
  if (!platform) {
    console.warn(`[Pipeline] Unknown ats_platform "${board.ats_platform}" — skipping`);
    return false;
  }

  let jobs;
  try {
    jobs = await platform.parser.fetchBoardJobs(board.board_slug);
  } catch (err) {
    const failures = board.consecutive_failures + 1;
    const backoffDays = Math.min(failures, CIRCUIT_BREAKER_MAX_DAYS);
    const shouldBackOff = failures >= CIRCUIT_BREAKER_THRESHOLD;
    console.error(
      `[Pipeline] Failed to poll ${board.ats_platform}/"${board.board_slug}" (${failures} consecutive):`,
      err.message,
      shouldBackOff ? `— backing off ${backoffDays}d` : ''
    );
    await pool.query(
      `UPDATE known_boards SET consecutive_failures = $3,
         backoff_until = CASE WHEN $4 THEN NOW() + INTERVAL '1 day' * $5 ELSE backoff_until END
       WHERE ats_platform = $1 AND board_slug = $2`,
      [board.ats_platform, board.board_slug, failures, shouldBackOff, backoffDays]
    );
    return false;
  }

  if (jobs === null) return false; // board no longer exists — not a failure, just gone

  await pool.query(
    `UPDATE known_boards
     SET last_polled_at = NOW(), last_yield_count = $3,
         consecutive_failures = 0, backoff_until = NULL
     WHERE ats_platform = $1 AND board_slug = $2`,
    [board.ats_platform, board.board_slug, jobs.length]
  );

  // Best-effort mapping back to the target that discovered this board, so
  // we know which location/recency constraints to filter against. If that
  // target was since renamed/paused, fall back to no constraint rather than
  // silently dropping jobs over bookkeeping drift.
  const target = targetsByRoleQuery.get(board.first_discovered_via);
  const stats = (statsByPlatform[board.ats_platform] ??= emptyStats());
  await storeJobBatch(jobs, target?.locations || [], target?.posted_within_days ?? null, stats);
  return true;
}

async function pollKnownBoards(targetsByRoleQuery, statsByPlatform) {
  // Never-polled boards first (NULLS FIRST), then stalest-first — so if a
  // run gets cut short, it's always a *different* tail of boards left
  // behind, not the same newly-discovered ones stuck at the back every day.
  const { rows: boards } = await pool.query(
    `SELECT ats_platform, board_slug, first_discovered_via, consecutive_failures
     FROM known_boards
     WHERE backoff_until IS NULL OR backoff_until < NOW()
     ORDER BY last_polled_at ASC NULLS FIRST`
  );

  let polled = 0;
  await mapWithConcurrency(boards, POLL_CONCURRENCY, async (board) => {
    const ok = await pollOneBoard(board, targetsByRoleQuery, statsByPlatform);
    if (ok) polled += 1;
  });

  return polled;
}

// LinkedIn has no structured API and no "board" to poll for free — every
// lead comes straight from a fresh search each run, stored immediately per
// target for the same reason pollKnownBoards stores per-board.
async function pollLinkedInLeads(targets, statsByPlatform) {
  let found = 0;
  for (const target of targets) {
    const jobs = await linkedin.discoverLeads(target);
    found += jobs.length;
    const stats = (statsByPlatform.linkedin ??= emptyStats());
    await storeJobBatch(jobs, target.locations || [], target.posted_within_days ?? null, stats);
  }
  return found;
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
  return { fetched: 0, new: 0, locationFiltered: 0, staleFiltered: 0, alreadySeen: 0, errors: 0, notAJobPosting: 0 };
}

// Custom (non-ATS) career pages, found via a broad, unrestricted search.
// Unlike the ATS/LinkedIn tiers, there's no board to poll and no free
// re-check — every candidate genuinely costs a fetch + (if it passes) a
// Claude call, so the URL-seen gate MUST run before that spend, not after
// (the ATS tiers can afford to check it after a cheap structured-API fetch;
// this tier can't afford to fetch+extract first and ask questions later).
async function discoverCustomSiteJobs(targets) {
  const stats = emptyStats();
  let extractionCalls = 0;

  for (const target of targets) {
    if (extractionCalls >= CUSTOM_EXTRACTION_CALLS_PER_RUN) break;

    let candidates;
    try {
      candidates = await customSite.discoverCustomSiteUrls(target);
    } catch (err) {
      console.error(`[Pipeline] Custom-site discovery failed for "${target.role_query}":`, err.message);
      continue;
    }

    for (const candidate of candidates) {
      if (extractionCalls >= CUSTOM_EXTRACTION_CALLS_PER_RUN) break;
      stats.fetched += 1;

      const isNewUrl = await markSeen(candidate.url);
      if (!isNewUrl) {
        stats.alreadySeen += 1;
        continue;
      }

      try {
        const page = await fetchPageText(candidate.url);
        if (!page) { stats.errors += 1; continue; }

        extractionCalls += 1;
        const extracted = await extractJobFromPage(page.text, candidate.url);
        if (!extracted || !extracted.is_job_posting) {
          stats.notAJobPosting += 1;
          continue;
        }

        if (!matchesLocation(extracted.location, target.locations)) {
          stats.locationFiltered += 1;
          continue;
        }

        const job = {
          external_id:     `custom_${crypto.createHash('sha256').update(candidate.url).digest('hex').slice(0, 16)}`,
          company_name:    extracted.company_name || 'Unknown',
          title:           extracted.title || candidate.title,
          location:        extracted.location || 'Remote',
          job_type:        extracted.job_type || null,
          description:     extracted.description || '',
          requirements:    null,
          salary_min:      extracted.salary_min ?? null,
          salary_max:      extracted.salary_max ?? null,
          salary_currency: extracted.salary_currency ?? null,
          posted_at:       new Date(), // no reliable posted date from an arbitrary page
          apply_url:       candidate.url,
          source_api:      'custom_site_search', // matches recordIngestionLog's `${platform}_search` convention
          raw_data: {
            tech_stack: extracted.tech_stack || [],
            extraction_confidence: extracted.confidence,
            rendered_with_browser: page.renderedWithBrowser,
          },
        };

        const inserted = await storeRawJob(job);
        if (inserted) stats.new += 1;
      } catch (err) {
        stats.errors += 1;
        console.error(`[Pipeline] Custom-site processing failed for "${candidate.url}":`, err.message);
      }
    }
  }

  return stats;
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

    const statsByPlatform = {};

    const discovered = await discoverBoards(targets);
    console.log(`[Pipeline] Discovered ${discovered} new board(s)`);

    // Each board's jobs are stored immediately as it's polled (inside
    // pollKnownBoards itself), not batched in memory until this whole pass
    // finishes — so index.js's hard timeout can only ever cost us boards not
    // yet reached, never jobs already fetched.
    const polled = await pollKnownBoards(targetsByRoleQuery, statsByPlatform);
    console.log(`[Pipeline] Polled ${polled} known board(s)`);

    const linkedInCount = await pollLinkedInLeads(targets, statsByPlatform);
    console.log(`[Pipeline] Found ${linkedInCount} LinkedIn lead(s)`);

    const customSiteStats = await discoverCustomSiteJobs(targets);
    statsByPlatform.custom_site = customSiteStats;
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
