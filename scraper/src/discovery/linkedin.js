'use strict';

const searxng = require('./searxng');

const SITE_FILTER = 'site:linkedin.com/jobs/view';

// LinkedIn's search-result titles follow a strong, consistent English pattern:
// "{Company} hiring {Title} in {Location} | LinkedIn". Non-English results and
// LinkedIn's own aggregator pages ("8,000+ jobs in United States") don't match
// this — we deliberately skip those rather than guess, since this is a
// lead-capture tier: better to surface fewer, higher-confidence leads.
const TITLE_RE = /^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+?)(?:\s*\|\s*LinkedIn)?$/i;

// The job ID is the trailing digits in every /jobs/view/... URL, regardless
// of locale subdomain (www./fr./co. etc) — used as the stable external_id.
const JOB_ID_RE = /-(\d{6,})(?:[/?#].*)?$/;

function parseResult(result) {
  const titleMatch = String(result.title || '').match(TITLE_RE);
  const idMatch = String(result.url || '').match(JOB_ID_RE);
  if (!titleMatch || !idMatch) return null; // ambiguous — skip rather than guess

  const [, company, title, location] = titleMatch;
  const jobId = idMatch[1];

  return {
    external_id:     `linkedin_${jobId}`,
    company_name:    company.trim(),
    title:           title.trim(),
    location:        location.trim(),
    job_type:        null,
    // Snippet only — we deliberately never fetch the LinkedIn page itself
    // (anti-bot risk + against their robots.txt). Click through for the
    // full description.
    description:     result.description || null,
    requirements:    null,
    salary_min:       null,
    salary_max:       null,
    salary_currency: null,
    // LinkedIn's real posting date isn't reliably parseable from a search
    // snippet across locales, so we use discovery time as a stand-in. This
    // means a target's posted_within_days filter is effectively a no-op for
    // LinkedIn leads — a known, accepted limitation of this lightweight tier.
    posted_at:       new Date(),
    apply_url:       result.url,
    source_api:      'linkedin_search',
    raw_data:        { lead_only: true, snippet: result.description },
  };
}

// Returns lightweight job "leads" for one target — title/company/location/URL
// only, parsed straight from search results. No board to poll, no page
// fetched: every discovery run re-searches from scratch for this source.
async function discoverLeads(target) {
  const query = `${target.role_query} ${SITE_FILTER}`;
  const results = await searxng.search(query, { count: 20 });

  return results
    .map(parseResult)
    .filter(Boolean);
}

module.exports = { discoverLeads };
