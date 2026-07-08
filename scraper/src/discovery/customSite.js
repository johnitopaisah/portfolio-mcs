'use strict';

const searxng = require('./searxng');

// Domains to never treat as a "custom site" candidate: either already
// covered by a structured ATS parser (searching them here would just
// duplicate the site: filtered discovery), or third-party job-board
// aggregators we deliberately don't scrape (re-hosted listings, not a
// company's own page — exactly what this whole design moved away from).
// Exact-domain matches: already-covered ATS platforms (searching these here
// would just duplicate the site:-filtered structured discovery).
const EXCLUDED_DOMAINS = [
  'boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co',
  'jobs.ashbyhq.com', 'myworkdayjobs.com', 'careers.smartrecruiters.com',
];

// Brand-name substring matches: job-board aggregators (re-hosted listings,
// not a company's own page). Matched as a substring of the hostname rather
// than exact domains, since these operate under many country TLDs
// (glassdoor.com, .fr, .de, .co.uk, ...) that would be easy to keep missing
// one-by-one otherwise.
const EXCLUDED_BRAND_FRAGMENTS = [
  'linkedin.', 'indeed.', 'glassdoor.', 'ziprecruiter.', 'monster.',
  'careerbuilder.', 'simplyhired.', 'dice.com', 'wellfound.', 'angel.co',
  'weworkremotely.', 'remoteok.', 'roberthalf.', 'randstad', 'adecco.',
  'welcometothejungle.', 'jobteaser.', 'apec.fr', 'pole-emploi.',
  'jooble.', 'adzuna.', 'talent.com', 'jobrapido.', 'builtin',
  'devitjobs', 'themuse.', 'otta.com', 'levels.fyi', 'lesjeudis.',
  'remoterocketship.',
];

function isExcluded(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (EXCLUDED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) return true;
    return EXCLUDED_BRAND_FRAGMENTS.some((frag) => hostname.includes(frag));
  } catch {
    return true; // unparseable URL — don't risk it
  }
}

// Cheap, pre-Claude heuristic: does this look like a specific job posting
// URL/title at all, or obviously something else (homepage, blog, login
// page)? Not authoritative — extractJobFromPage()'s own is_job_posting
// check is the real gate — this just avoids the most obvious non-matches
// before spending a Claude call.
const JOB_URL_HINTS = /\/(job|jobs|career|careers|position|vacanc|opening|emploi|poste)/i;
const OBVIOUS_NON_JOB = /\/(blog|news|about|contact|login|signin|privacy|terms|cookie)/i;

function looksLikeJobPosting(url, title) {
  if (OBVIOUS_NON_JOB.test(url)) return false;
  return JOB_URL_HINTS.test(url) || /\b(hiring|job|career|poste|emploi)\b/i.test(title || '');
}

// Broad (non-site-restricted) search for a target — finds bespoke career
// pages on companies not on any known ATS platform. Lower frequency than
// the ATS-specific searches is expected (call this less often from the
// pipeline), since it's a wider net over the whole web.
async function discoverCustomSiteUrls(target) {
  const results = await searxng.search(target.role_query, { count: 20 });

  return results
    .filter((r) => !isExcluded(r.url))
    .filter((r) => looksLikeJobPosting(r.url, r.title))
    .map((r) => ({ url: r.url, title: r.title }));
}

module.exports = { discoverCustomSiteUrls, isExcluded, looksLikeJobPosting };
