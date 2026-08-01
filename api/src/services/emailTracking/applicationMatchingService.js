'use strict';

// Matches an inbound email to a row in `applications`.
//
// Domain equality alone is a weak signal: apply_url/job_url for most
// applications point at an ATS (Greenhouse, Lever, Workday...), not the
// company's own domain, and replies frequently come FROM that same shared
// ATS domain rather than the company. So domain match is only trusted as a
// bonus/tie-breaker when the sender isn't on a shared ATS domain — the
// primary signal is trigram similarity between applications.company_name
// and whatever the AI classifier extracted from the email content, which
// reads the whole body/signature rather than guessing from a hostname.

const MATCH_THRESHOLD     = 0.5;  // company_sim at/above this -> confident match
const SUGGEST_THRESHOLD   = 0.3;  // company_sim at/above this -> surfaced as a suggestion

const ATS_SENDER_DOMAINS = new Set([
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com',
  'smartrecruiters.com', 'workable.com', 'icims.com', 'taleo.net',
  'bamboohr.com', 'breezy.hr', 'jobvite.com', 'successfactors.com',
]);

function domainOf(email) {
  const at = (email || '').split('@')[1];
  return at ? at.toLowerCase() : '';
}

function isAtsDomain(domain) {
  return [...ATS_SENDER_DOMAINS].some(d => domain === d || domain.endsWith('.' + d));
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ senderEmail: string, senderName?: string, extractedCompany?: string, extractedRole?: string }} email
 * @returns {Promise<{ status: 'matched'|'suggested'|'none', application?: object, method?: string }>}
 */
async function findMatch(pool, { senderEmail, senderName = '', extractedCompany = '', extractedRole = '' }) {
  const domain      = domainOf(senderEmail);
  const domainRoot   = domain.split('.')[0] || '';
  const nameGuess    = senderName || domainRoot;
  const trustDomain  = !!domain && !isAtsDomain(domain);

  const { rows } = await pool.query(
    `SELECT id, company_name, job_title, status,
            GREATEST(similarity(company_name, $1), similarity(company_name, $2)) AS company_sim,
            CASE WHEN $3 <> '' THEN similarity(job_title, $3) ELSE 0 END          AS title_sim,
            (company_domain IS NOT NULL AND company_domain = $4 AND $5)           AS domain_match
     FROM applications
     WHERE status <> 'ARCHIVED'
     ORDER BY (
       (CASE WHEN company_domain IS NOT NULL AND company_domain = $4 AND $5 THEN 1 ELSE 0 END) * 2
       + GREATEST(similarity(company_name, $1), similarity(company_name, $2))
       + (CASE WHEN $3 <> '' THEN similarity(job_title, $3) ELSE 0 END) * 0.5
     ) DESC
     LIMIT 5`,
    [extractedCompany || '', nameGuess, extractedRole || '', domain, trustDomain]
  );

  const best = rows[0];
  if (!best) return { status: 'none' };

  if (best.domain_match || Number(best.company_sim) >= MATCH_THRESHOLD) {
    return { status: 'matched', application: best, method: best.domain_match ? 'domain' : 'name_trgm' };
  }
  if (Number(best.company_sim) >= SUGGEST_THRESHOLD) {
    return { status: 'suggested', application: best, method: 'name_trgm' };
  }
  return { status: 'none' };
}

module.exports = { findMatch, isAtsDomain, domainOf, MATCH_THRESHOLD, SUGGEST_THRESHOLD };
