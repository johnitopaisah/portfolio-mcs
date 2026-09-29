'use strict';
/**
 * Contract/canary checks — catches a silent ATS API shape change (a parser
 * that stops throwing but starts returning empty/garbled data) before it
 * causes an unexplained volume drop weeks later. Run independently of the
 * main discovery pipeline (see scripts/run-canary.js) against a
 * well-known, stable public board per platform — not part of the hot path,
 * since it deliberately re-checks known-good boards every time rather than
 * relying on whatever's in known_boards.
 */

const greenhouse = require('./parsers/greenhouse');
const lever = require('./parsers/lever');
const ashby = require('./parsers/ashby');
const workday = require('./parsers/workday');
const smartrecruiters = require('./parsers/smartrecruiters');

// Large, stable, long-standing public boards — chosen to make a low job
// count unlikely, but any single company's hiring can still genuinely dry
// up (seen live 2026-07-21: mistral's Lever board hit zero open postings —
// confirmed via their own public board page, not a parser bug — so it was
// swapped for theodo, currently ~150 postings). Because a single company
// going quiet is real and not that rare, low-count failures are treated as
// 'warning' severity below, not 'critical' — see checkOne().
//
// 2026-09-29: smartrecruiters/Sandisk started returning totalFound: 0
// (canary-checker-29842920, both attempts). Confirmed via the public API
// directly — SanDisk's postings now live under SmartRecruiters identifier
// "WesternDigital" (335 open postings), not "Sandisk" — a company-side
// identifier consolidation, not a parser regression. Promoted WesternDigital
// to primary and kept Sandisk as a fallbackSlugs entry (see checkOne) so a
// future rename/consolidation on ANY of these — not just this one — degrades
// to a warning instead of failing the whole job the next time it happens.
const CANARIES = [
  { platform: 'greenhouse', slug: 'gitlab', minJobs: 20 },
  { platform: 'lever', slug: 'theodo', minJobs: 20 },
  { platform: 'ashby', slug: 'notion', minJobs: 20 },
  { platform: 'workday', slug: 'visa|wd5|Visa', minJobs: 20 },
  { platform: 'smartrecruiters', slug: 'WesternDigital', minJobs: 20, fallbackSlugs: ['Sandisk'] },
];

const PARSERS = { greenhouse, lever, ashby, workday, smartrecruiters };

const REQUIRED_FIELDS = ['title', 'company_name', 'location', 'apply_url', 'source_api'];

function validateJobShape(job) {
  const problems = [];
  for (const field of REQUIRED_FIELDS) {
    if (!job[field] || typeof job[field] !== 'string' || job[field].trim() === '') {
      problems.push(`missing/empty "${field}"`);
    }
  }
  if (typeof job.description !== 'string') problems.push('"description" is not a string (should be "", never null/undefined)');
  return problems;
}

// severity: 'critical' means the PARSER is broken (threw, wrong type, bad
// shape) — this is unambiguously our bug and should page. 'warning' means
// either the board returned fewer jobs than expected (the anchor company's
// real-world hiring activity, which we don't control and which can
// legitimately dip to zero — see the CANARIES comment above) or the primary
// slug no longer resolves but a configured fallbackSlugs entry does (the
// company renamed/consolidated their ATS identifier, same shape as the
// 2026-09-29 Sandisk->WesternDigital case). Neither should page on its own,
// but both are surfaced so the primary slug can be promoted at leisure
// instead of under job-failure pressure.
//
// A candidate is only retried against fallbackSlugs when it comes back
// null ("this identifier doesn't resolve") or throws — that's the specific
// signature of an identifier moving. A wrong-type/bad-shape result fails
// fast as critical without trying fallbacks, since that means the PARSER
// broke for a board we know exists, which a different slug can't fix.
async function checkOne({ platform, slug, fallbackSlugs = [], minJobs }) {
  const parser = PARSERS[platform];
  const candidates = [slug, ...fallbackSlugs];
  const unresolved = [];

  for (const candidate of candidates) {
    let jobs;
    try {
      jobs = await parser.fetchBoardJobs(candidate);
    } catch (err) {
      unresolved.push(`${candidate} (threw: ${err.message})`);
      continue;
    }

    if (jobs === null) {
      unresolved.push(`${candidate} (no longer resolves)`);
      continue;
    }
    if (!Array.isArray(jobs)) {
      return { platform, slug: candidate, ok: false, severity: 'critical', reason: `fetchBoardJobs returned ${typeof jobs}, expected an array` };
    }
    if (jobs.length < minJobs) {
      return { platform, slug: candidate, ok: false, severity: 'warning', reason: `only ${jobs.length} jobs returned, expected at least ${minJobs} — likely this company's hiring activity, not a parser issue` };
    }

    const shapeProblems = validateJobShape(jobs[0]);
    if (shapeProblems.length > 0) {
      return { platform, slug: candidate, ok: false, severity: 'critical', reason: `first job failed shape check: ${shapeProblems.join(', ')}` };
    }

    if (candidate !== slug) {
      return {
        platform,
        slug: candidate,
        ok: false,
        severity: 'warning',
        reason: `${jobs.length} jobs, shape OK via fallback slug "${candidate}" — primary "${slug}" no longer resolves; promote "${candidate}" to slug in CANARIES`,
      };
    }
    return { platform, slug: candidate, ok: true, reason: `${jobs.length} jobs, shape OK` };
  }

  return {
    platform,
    slug,
    ok: false,
    severity: 'critical',
    reason: `no candidate identifier resolves (tried: ${unresolved.join('; ')})`,
  };
}

async function runCanaryChecks() {
  const results = [];
  for (const canary of CANARIES) {
    results.push(await checkOne(canary));
  }
  return results;
}

module.exports = { runCanaryChecks, CANARIES };
