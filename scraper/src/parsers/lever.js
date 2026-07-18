'use strict';

const axios = require('axios');
const { slugToCompanyName } = require('../htmlUtils');

const BOARD_URL_RE = /jobs\.lever\.co\/([a-z0-9][a-z0-9_-]*)/i;

// Extracts a Lever board slug from any URL that points at it, e.g.
// https://jobs.lever.co/acme/<posting-uuid> -> "acme".
function extractBoardSlug(url) {
  const match = String(url || '').match(BOARD_URL_RE);
  return match ? match[1].toLowerCase() : null;
}

// Fetches every open posting on a Lever board. Lever's API returns the
// postings array directly (not wrapped in an object like Greenhouse/Ashby),
// and description text comes back already plain/unencoded.
async function fetchBoardJobs(slug) {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;

  let data;
  try {
    // Lever returns the whole board in one response, no pagination — a large
    // employer's postings can run well into multiple MB (e.g. jobgether's
    // board is 13MB+, seen live 2026-07-13), so this needs real headroom
    // rather than the 10s used by the paginated parsers (Workday/SmartRecruiters).
    ({ data } = await axios.get(url, { timeout: 30000 }));
  } catch (err) {
    if (err.response?.status === 404) return null; // board doesn't exist / was removed
    throw err;
  }

  if (!Array.isArray(data)) return null; // e.g. {ok:false,error:'Document not found'}

  const companyName = slugToCompanyName(slug);

  return data.map((j) => ({
    external_id:     `lever_${slug}_${j.id}`,
    company_name:    companyName,
    title:           j.text,
    location:        j.categories?.location || 'Remote',
    job_type:        j.categories?.commitment || null,
    description:     j.descriptionPlain || '', // jobs_raw.description is NOT NULL — Lever sometimes omits this field
    requirements:    null,
    salary_min:      null,
    salary_max:      null,
    salary_currency: null,
    posted_at:       j.createdAt ? new Date(j.createdAt) : new Date(),
    apply_url:       j.hostedUrl,
    source_api:      'lever_search',
    raw_data:        { board_slug: slug, lever_job_id: j.id, team: j.categories?.team },
  }));
}

module.exports = { extractBoardSlug, fetchBoardJobs };
