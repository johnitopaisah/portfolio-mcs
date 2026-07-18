'use strict';

const axios = require('axios');
const { stripHtml, slugToCompanyName } = require('../htmlUtils');

const BOARD_URL_RE = /jobs\.ashbyhq\.com\/([^/]+)/i;

// Extracts an Ashby board slug from any URL that points at it, e.g.
// https://jobs.ashbyhq.com/notion/<posting-uuid> -> "notion". Board names
// can contain URL-encoded spaces (e.g. "concentrate%20ai"), so decode first.
function extractBoardSlug(url) {
  const match = String(url || '').match(BOARD_URL_RE);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).toLowerCase();
  } catch {
    return match[1].toLowerCase();
  }
}

// Fetches every open posting on an Ashby job board.
async function fetchBoardJobs(slug) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;

  let data;
  try {
    // Ashby returns the whole board in one response, no pagination — a large
    // employer's postings can take well over 10s to fully transfer.
    ({ data } = await axios.get(url, { timeout: 30000 }));
  } catch (err) {
    if (err.response?.status === 404) return null; // board doesn't exist / was removed
    throw err;
  }

  if (!Array.isArray(data?.jobs)) return null;

  const companyName = slugToCompanyName(slug);

  return data.jobs.map((j) => ({
    external_id:     `ashby_${slug}_${j.id}`,
    company_name:    companyName,
    title:           j.title,
    location:        j.location || 'Remote',
    job_type:        j.employmentType || null,
    description:     stripHtml(j.descriptionHtml),
    requirements:    null,
    salary_min:      null,
    salary_max:      null,
    salary_currency: null,
    posted_at:       j.publishedAt ? new Date(j.publishedAt) : new Date(),
    apply_url:       j.applyUrl || j.jobUrl,
    source_api:      'ashby_search',
    raw_data:        { board_slug: slug, ashby_job_id: j.id, department: j.department, is_remote: j.isRemote },
  }));
}

module.exports = { extractBoardSlug, fetchBoardJobs };
