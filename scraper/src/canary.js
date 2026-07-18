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

// Large, stable, long-standing public boards — chosen because they're
// unlikely to ever go to zero postings or disappear, so a canary failure
// here means the PARSER broke, not that the company stopped hiring.
const CANARIES = [
  { platform: 'greenhouse', slug: 'gitlab', minJobs: 20 },
  { platform: 'lever', slug: 'mistral', minJobs: 20 },
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

async function checkOne({ platform, slug, minJobs }) {
  const parser = PARSERS[platform];
  try {
    const jobs = await parser.fetchBoardJobs(slug);

    if (jobs === null) {
      return { platform, slug, ok: false, reason: `fetchBoardJobs returned null — canary board "${slug}" no longer resolves` };
    }
    if (!Array.isArray(jobs)) {
      return { platform, slug, ok: false, reason: `fetchBoardJobs returned ${typeof jobs}, expected an array` };
    }
    if (jobs.length < minJobs) {
      return { platform, slug, ok: false, reason: `only ${jobs.length} jobs returned, expected at least ${minJobs} — API shape may have changed` };
    }

    const shapeProblems = validateJobShape(jobs[0]);
    if (shapeProblems.length > 0) {
      return { platform, slug, ok: false, reason: `first job failed shape check: ${shapeProblems.join(', ')}` };
    }

    return { platform, slug, ok: true, reason: `${jobs.length} jobs, shape OK` };
  } catch (err) {
    return { platform, slug, ok: false, reason: `threw: ${err.message}` };
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
