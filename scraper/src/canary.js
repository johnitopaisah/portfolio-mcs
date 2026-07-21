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
const CANARIES = [
  { platform: 'greenhouse', slug: 'gitlab', minJobs: 20 },
  { platform: 'lever', slug: 'theodo', minJobs: 20 },
  { platform: 'ashby', slug: 'notion', minJobs: 20 },
  { platform: 'workday', slug: 'visa|wd5|Visa', minJobs: 20 },
  { platform: 'smartrecruiters', slug: 'Sandisk', minJobs: 20 },
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
// the board just returned fewer jobs than expected — that's the anchor
// company's real-world hiring activity, which we don't control and which
// can legitimately dip to zero (see the CANARIES comment above), so it's
// surfaced but doesn't page on its own.
async function checkOne({ platform, slug, minJobs }) {
  const parser = PARSERS[platform];
  try {
    const jobs = await parser.fetchBoardJobs(slug);

    if (jobs === null) {
      return { platform, slug, ok: false, severity: 'critical', reason: `fetchBoardJobs returned null — canary board "${slug}" no longer resolves` };
    }
    if (!Array.isArray(jobs)) {
      return { platform, slug, ok: false, severity: 'critical', reason: `fetchBoardJobs returned ${typeof jobs}, expected an array` };
    }
    if (jobs.length < minJobs) {
      return { platform, slug, ok: false, severity: 'warning', reason: `only ${jobs.length} jobs returned, expected at least ${minJobs} — likely this company's hiring activity, not a parser issue` };
    }

    const shapeProblems = validateJobShape(jobs[0]);
    if (shapeProblems.length > 0) {
      return { platform, slug, ok: false, severity: 'critical', reason: `first job failed shape check: ${shapeProblems.join(', ')}` };
    }

    return { platform, slug, ok: true, reason: `${jobs.length} jobs, shape OK` };
  } catch (err) {
    return { platform, slug, ok: false, severity: 'critical', reason: `threw: ${err.message}` };
  }
}

async function runCanaryChecks() {
  const results = [];
  for (const canary of CANARIES) {
    results.push(await checkOne(canary));
  }
  return results;
}

module.exports = { runCanaryChecks, CANARIES };
