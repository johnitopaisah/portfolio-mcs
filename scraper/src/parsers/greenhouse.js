'use strict';

const axios = require('axios');
const { stripHtml, slugToCompanyName } = require('../htmlUtils');

const BOARD_URL_RE = /boards\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9][a-z0-9_-]*)/i;

// Extracts a Greenhouse board slug (aka "board token") from any URL that
// points at it, e.g. https://boards.greenhouse.io/acme/jobs/123 -> "acme".
function extractBoardSlug(url) {
  const match = String(url || '').match(BOARD_URL_RE);
  return match ? match[1].toLowerCase() : null;
}

// Fetches every open posting on a Greenhouse board and normalizes it into
// the same shape jobIngestionService.js's storeRawJob() already expects.
async function fetchBoardJobs(slug) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;

  let data;
  try {
    ({ data } = await axios.get(url, { timeout: 10000 }));
  } catch (err) {
    if (err.response?.status === 404) return null; // board doesn't exist / was removed
    throw err;
  }

  const companyName = slugToCompanyName(slug);

  const jobs = (data?.jobs || []).map((j) => ({
    external_id:     `greenhouse_${slug}_${j.id}`,
    company_name:    companyName,
    title:           j.title,
    location:        j.location?.name || 'Remote',
    job_type:        null,
    description:     stripHtml(j.content),
    requirements:    null,
    salary_min:      null,
    salary_max:      null,
    salary_currency: null,
    posted_at:       j.updated_at ? new Date(j.updated_at) : new Date(),
    apply_url:       j.absolute_url,
    source_api:      'greenhouse_search',
    raw_data:        { board_slug: slug, greenhouse_job_id: j.id, departments: j.departments },
  }));

  return jobs;
}

module.exports = { extractBoardSlug, fetchBoardJobs };
