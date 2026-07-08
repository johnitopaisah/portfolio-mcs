'use strict';

const axios = require('axios');
const { stripHtml } = require('../htmlUtils');

const BOARD_URL_RE = /(?:careers|jobs)\.smartrecruiters\.com\/([^/?#]+)/i;

// Company identifiers are case-sensitive in SmartRecruiters' API path, so
// unlike other parsers this deliberately does NOT lowercase the match.
function extractBoardSlug(url) {
  const m = String(url || '').match(BOARD_URL_RE);
  return m ? m[1] : null;
}

// Same cost shape as Workday: the list endpoint is cheap (paginated, no
// description), full descriptions need a separate per-posting detail
// request. Capped per poll for the same reason — some boards list
// hundreds of openings.
const LIST_PAGE_SIZE = 100;
const LIST_SAFETY_CAP = 2000;
const DETAIL_FETCH_CAP = 100;

async function fetchJobList(company) {
  const postings = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total && offset < LIST_SAFETY_CAP) {
    let data;
    try {
      ({ data } = await axios.get(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings`,
        { params: { limit: LIST_PAGE_SIZE, offset }, timeout: 10000 }
      ));
    } catch (err) {
      if (err.response?.status === 404) return offset === 0 ? null : postings;
      throw err;
    }

    // SmartRecruiters returns HTTP 200 with totalFound: 0 for a company that
    // doesn't exist (no 404) — this is the real "doesn't exist" signal.
    if (offset === 0 && (!data.totalFound || data.totalFound === 0)) return null;
    if (!Array.isArray(data.content) || data.content.length === 0) break;

    postings.push(...data.content);
    total = data.totalFound;
    offset += LIST_PAGE_SIZE;
  }

  return postings;
}

async function fetchJobDetail(company, id) {
  try {
    const { data } = await axios.get(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings/${id}`,
      { timeout: 10000 }
    );
    return data;
  } catch {
    return null; // detail fetch failing shouldn't sink the whole board's poll
  }
}

async function fetchBoardJobs(company) {
  const postings = await fetchJobList(company);
  if (postings === null) return null;
  if (postings.length === 0) return [];

  const jobs = [];

  for (const [i, p] of postings.entries()) {
    const detail = i < DETAIL_FETCH_CAP ? await fetchJobDetail(company, p.id) : null;
    const sections = detail?.jobAd?.sections || {};
    const descriptionHtml = [sections.jobDescription?.text, sections.qualifications?.text]
      .filter(Boolean).join(' ');

    jobs.push({
      external_id:     `smartrecruiters_${company}_${p.id}`,
      company_name:    p.company?.name || company,
      title:           p.name,
      location:        p.location?.fullLocation || (p.location?.remote ? 'Remote' : 'Remote'),
      job_type:        p.typeOfEmployment?.label || null,
      description:     descriptionHtml ? stripHtml(descriptionHtml) : '', // jobs_raw.description is NOT NULL
      requirements:    null,
      salary_min:      null,
      salary_max:      null,
      salary_currency: null,
      posted_at:       p.releasedDate ? new Date(p.releasedDate) : new Date(),
      apply_url:       detail?.applyUrl || detail?.postingUrl
                        || `https://jobs.smartrecruiters.com/${company}/${p.id}`,
      source_api:      'smartrecruiters_search',
      raw_data:        { company, posting_id: p.id, ref: p.refNumber },
    });
  }

  return jobs;
}

module.exports = { extractBoardSlug, fetchBoardJobs };
