'use strict';

const axios = require('axios');
const { stripHtml, slugToCompanyName } = require('../htmlUtils');

// Workday URLs: https://{tenant}.wd{N}.myworkdayjobs.com/{locale}/{site}/job/...
// Unlike Greenhouse/Lever/Ashby, three pieces of info are needed to hit the
// API (tenant, datacenter number, site) — encoded together as one composite
// board_slug ("tenant|wd5|Site") so it still fits the single-string
// known_boards.board_slug column.
const BOARD_URL_RE = /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/i;

function extractBoardSlug(url) {
  const m = String(url || '').match(BOARD_URL_RE);
  if (!m) return null;
  const [, tenant, wd, site] = m;
  return `${tenant.toLowerCase()}|${wd.toLowerCase()}|${site}`;
}

// Bounds cost per poll: the list endpoint (cheap, one request per 100 jobs)
// has no cap, but the detail endpoint (needed for description + a real
// posted date) is a separate request per posting. Large boards (some
// Workday tenants list 900+ openings) would make every poll very slow if
// every posting's detail were fetched every run. Capping means very large
// boards take a few extra daily polls to fully enrich — acceptable for a
// personal tool, and far cheaper than an unbounded N+1 per run.
const DETAIL_FETCH_CAP = 100;
const LIST_PAGE_SIZE = 20; // Workday's CXS API 400s above this (verified live — 50 and 100 both fail)
const LIST_SAFETY_CAP = 2000; // hard ceiling regardless of a board's reported total

async function fetchJobList(tenant, wd, site) {
  const listUrl = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const postings = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total && offset < LIST_SAFETY_CAP) {
    let data;
    try {
      ({ data } = await axios.post(
        listUrl,
        { appliedFacets: {}, limit: LIST_PAGE_SIZE, offset, searchText: '' },
        { timeout: 10000 }
      ));
    } catch (err) {
      // 422 (and sometimes 404) is Workday's "tenant/site doesn't exist" signal
      if (err.response?.status === 422 || err.response?.status === 404) {
        return offset === 0 ? null : postings;
      }
      throw err;
    }

    if (!Array.isArray(data?.jobPostings) || data.jobPostings.length === 0) break;
    postings.push(...data.jobPostings);
    // Workday's `total` is only accurate on the very first page (verified
    // live) — every subsequent page reports total: 0, which would otherwise
    // overwrite the real value and stop pagination after page 2. Only trust
    // it while we don't have a real one yet.
    if (offset === 0 && typeof data.total === 'number' && data.total > 0) {
      total = data.total;
    }
    offset += LIST_PAGE_SIZE;
  }

  return postings;
}

async function fetchJobDetail(tenant, wd, site, externalPath) {
  const url = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}${externalPath}`;
  try {
    const { data } = await axios.get(url, { timeout: 10000 });
    return data?.jobPostingInfo || null;
  } catch {
    return null; // detail fetch failing shouldn't sink the whole board's poll
  }
}

async function fetchBoardJobs(compositeSlug) {
  const [tenant, wd, site] = compositeSlug.split('|');
  if (!tenant || !wd || !site) return null;

  const postings = await fetchJobList(tenant, wd, site);
  if (postings === null) return null; // board doesn't exist
  if (postings.length === 0) return [];

  const companyName = slugToCompanyName(site);
  const jobs = [];

  for (const [i, posting] of postings.entries()) {
    const externalPath = posting.externalPath;
    if (!externalPath) continue;

    const applyUrl = `https://${tenant}.${wd}.myworkdayjobs.com/${site}${externalPath}`;
    const jobIdMatch = externalPath.match(/_([A-Za-z0-9-]+)$/);
    const jobId = jobIdMatch ? jobIdMatch[1] : externalPath;

    // Only fetch full detail (description + real posted date) for the
    // first DETAIL_FETCH_CAP postings this poll — see comment above.
    const detail = i < DETAIL_FETCH_CAP ? await fetchJobDetail(tenant, wd, site, externalPath) : null;

    jobs.push({
      external_id:     `workday_${tenant}_${site}_${jobId}`,
      company_name:    companyName,
      title:           posting.title,
      location:        detail?.location || posting.locationsText || 'Remote',
      job_type:        detail?.timeType || null,
      // jobs_raw.description is NOT NULL — empty string, not null, when
      // detail wasn't fetched (beyond DETAIL_FETCH_CAP) or came back empty.
      description:     detail?.jobDescription ? stripHtml(detail.jobDescription) : '',
      requirements:    null,
      salary_min:      null,
      salary_max:      null,
      salary_currency: null,
      // startDate (detail only) is a real ISO date; the list endpoint only
      // has relative text ("Posted Today") which isn't parseable to a date.
      posted_at:       detail?.startDate ? new Date(detail.startDate) : new Date(),
      apply_url:       detail?.externalUrl || applyUrl,
      source_api:      'workday_search',
      raw_data:        { tenant, wd, site, job_req_id: posting.bulletFields?.[0] || null },
    });
  }

  return jobs;
}

module.exports = { extractBoardSlug, fetchBoardJobs };
