'use strict';

// Matches an inbound email to a row in `applications`.
//
// An application is identified by company + role, never company alone — two
// roles at the same company are two applications. Matching is therefore two
// stages: find the company's applications, then decide between them by role.
//
// Stage 1 (company): domain equality alone is a weak signal — apply_url /
// job_url for most applications point at an ATS (Greenhouse, Lever,
// Workday...), not the company's own domain, and replies frequently come
// FROM that same shared ATS domain rather than the company. So domain match
// is only trusted when the sender isn't on a shared ATS domain; the primary
// signal is trigram similarity between applications.company_name and
// whatever the AI classifier extracted from the email content.
//
// Stage 2 (role): see decide(). An application confirmation ("thanks for
// applying") is a NEW application unless it is for a role already on file
// at that company; any other reply attaches to the application it is about.

const { STATUS_GROUPS, GROUPED_STATUSES } = require('../../constants/applicationStatuses');
const { roleSimilarity, isPlaceholderTitle, ROLE_MATCH, ROLE_DIFFERENT } = require('./roleSimilarity');

const MATCH_THRESHOLD     = 0.5;  // company_sim at/above this -> same company
const SUGGEST_THRESHOLD   = 0.3;  // company_sim at/above this -> surfaced as a suggestion

// Two confirmations for the same company inside this window with no way to
// tell the roles apart (ATS + company both acknowledge, or the same mail
// lands in both mailboxes) are one application, not two.
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

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

// Still in play: not rejected/withdrawn/ghosted and no final offer outcome.
function isOpen(app) {
  return GROUPED_STATUSES.includes(app.status) && !['ACCEPTED', 'DECLINED_OFFER'].includes(app.status);
}

function lastActivity(app) {
  return new Date(app.last_response_at || app.applied_at || app.created_at || 0).getTime();
}

function mostRecent(apps) {
  return [...apps].sort((a, b) => lastActivity(b) - lastActivity(a))[0];
}

/**
 * Pure stage-2 decision over the applications found for the email's company.
 *
 * @param {object}   args
 * @param {boolean}  args.isConfirmation  email acknowledges a submitted application
 * @param {string}   [args.extractedRole] role named in the email, if any
 * @param {object[]} args.candidates      rows with id, job_title, status, company_sim, domain_match,
 *                                        applied_at, created_at, last_response_at
 * @param {Date}     [args.receivedAt]
 * @returns {{ status: 'matched'|'suggested'|'new'|'none', application?: object, method?: string, companyName?: string }}
 *   'new'  — known company, but this is a role with no application on file
 *   'none' — nothing on file resembles this company
 */
function decide({ isConfirmation, extractedRole = '', candidates, receivedAt = new Date() }) {
  const strong = candidates.filter(c => c.domain_match || Number(c.company_sim) >= MATCH_THRESHOLD);

  if (!strong.length) {
    const weak = candidates
      .filter(c => Number(c.company_sim) >= SUGGEST_THRESHOLD)
      .sort((a, b) => Number(b.company_sim) - Number(a.company_sim));
    // A confirmation is a new application anyway; a vague company
    // resemblance is no reason to hold it back as a suggestion.
    if (!isConfirmation && weak.length) {
      return { status: 'suggested', application: weak[0], method: 'name_trgm' };
    }
    return { status: 'none' };
  }

  const companyMethod = app => (app.domain_match ? 'domain' : 'name_trgm');
  const role          = (extractedRole || '').trim();
  const roleUnknown   = strong.filter(c => isPlaceholderTitle(c.job_title));
  const byRole        = role
    ? strong
        .filter(c => !isPlaceholderTitle(c.job_title))
        .map(c => ({ app: c, sim: roleSimilarity(c.job_title, role) }))
        .sort((a, b) => b.sim - a.sim)
    : [];
  const bestRole = byRole[0];
  // Reuse the spelling already on file so the company's applications group together.
  const newRole  = { status: 'new', companyName: strong[0].company_name };

  if (role && bestRole && bestRole.sim >= ROLE_MATCH) {
    return { status: 'matched', application: bestRole.app, method: 'company_role' };
  }

  if (isConfirmation) {
    const at     = new Date(receivedAt).getTime();
    const recent = app => Math.abs(at - new Date(app.applied_at || app.created_at || 0).getTime()) <= DUPLICATE_WINDOW_MS;

    if (role) {
      // Second confirmation, this time naming the role, for an application
      // just auto-created without one.
      const dup = roleUnknown.filter(recent);
      if (dup.length) return { status: 'matched', application: mostRecent(dup), method: 'duplicate_confirmation' };
      return newRole;
    }

    // No role named. If exactly one application here is still being
    // prepared, this confirms it was sent.
    const prep = strong.filter(c => STATUS_GROUPS.prep.includes(c.status));
    if (prep.length === 1) return { status: 'matched', application: prep[0], method: companyMethod(prep[0]) };

    const dup = strong.filter(recent);
    if (dup.length) return { status: 'matched', application: mostRecent(dup), method: 'duplicate_confirmation' };

    return newRole;
  }

  // ── A reply about an existing application ────────────────────────────
  if (role) {
    // The only application at this company never had its role recorded.
    if (strong.length === 1 && roleUnknown.length === 1) {
      return { status: 'matched', application: strong[0], method: companyMethod(strong[0]) };
    }
    if (bestRole && bestRole.sim >= ROLE_DIFFERENT) {
      return { status: 'suggested', application: bestRole.app, method: 'company_role' };
    }
    if (roleUnknown.length) {
      return { status: 'suggested', application: mostRecent(roleUnknown), method: companyMethod(roleUnknown[0]) };
    }
    return newRole;
  }

  // No role named: only unambiguous when a single application could be meant.
  if (strong.length === 1) {
    return { status: 'matched', application: strong[0], method: companyMethod(strong[0]) };
  }
  const open = strong.filter(isOpen);
  if (open.length === 1) {
    return { status: 'matched', application: open[0], method: companyMethod(open[0]) };
  }
  const pick = mostRecent(open.length ? open : strong);
  return { status: 'suggested', application: pick, method: companyMethod(pick) };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} pool
 * @param {object}  email
 * @param {string}  email.senderEmail
 * @param {string}  [email.senderName]
 * @param {string}  [email.extractedCompany]
 * @param {string}  [email.extractedRole]
 * @param {boolean} [email.isConfirmation]
 * @param {string}  [email.sourceAccount]  with threadId, enables thread continuity
 * @param {string}  [email.threadId]
 * @param {Date}    [email.receivedAt]
 * @returns {Promise<{ status: 'matched'|'suggested'|'new'|'none', application?: object, method?: string }>}
 */
async function findMatch(pool, {
  senderEmail, senderName = '', extractedCompany = '', extractedRole = '',
  isConfirmation = false, sourceAccount = '', threadId = '', receivedAt = new Date(),
}) {
  // A follow-up in a thread already linked to exactly one application stays
  // on it, even when it doesn't repeat the company or role. Not applied to
  // confirmations: mail clients thread same-subject ATS acknowledgements
  // for different roles together.
  if (!isConfirmation && sourceAccount && threadId) {
    const { rows: threadApps } = await pool.query(
      `SELECT DISTINCT a.id, a.company_name, a.job_title, a.status
       FROM email_responses er
       JOIN applications a ON a.id = er.application_id
       WHERE er.source_account = $1 AND er.thread_id = $2 AND a.status <> 'ARCHIVED'`,
      [sourceAccount, threadId]
    );
    if (threadApps.length === 1) {
      const app      = threadApps[0];
      const conflict = extractedRole && !isPlaceholderTitle(app.job_title) &&
        roleSimilarity(app.job_title, extractedRole) < ROLE_DIFFERENT;
      if (!conflict) return { status: 'matched', application: app, method: 'thread' };
    }
  }

  const domain      = domainOf(senderEmail);
  const domainRoot   = domain.split('.')[0] || '';
  const nameGuess    = senderName || domainRoot;
  const trustDomain  = !!domain && !isAtsDomain(domain);

  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT id, company_name, job_title, status, applied_at, created_at, last_response_at,
              GREATEST(similarity(company_name, $1), similarity(company_name, $2)) AS company_sim,
              (company_domain IS NOT NULL AND company_domain = $3 AND $4)           AS domain_match
       FROM applications
       WHERE status <> 'ARCHIVED'
     ) c
     WHERE c.domain_match OR c.company_sim >= $5
     ORDER BY c.domain_match DESC, c.company_sim DESC
     LIMIT 25`,
    [extractedCompany || '', nameGuess, domain, trustDomain, SUGGEST_THRESHOLD]
  );

  return decide({ isConfirmation, extractedRole, candidates: rows, receivedAt });
}

module.exports = {
  findMatch, decide, isAtsDomain, domainOf,
  MATCH_THRESHOLD, SUGGEST_THRESHOLD, DUPLICATE_WINDOW_MS,
};
