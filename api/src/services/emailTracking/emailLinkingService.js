'use strict';

// Acts on a classified inbound email: links it to the application it is
// about, or records a new application when it is about one not on file.
//
// Kept out of emailWorker.js so the same logic backs the worker, the manual
// "split into new application" route and the history script.

const applicationMatchingService = require('./applicationMatchingService');
const { isPlaceholderTitle, PLACEHOLDER_TITLE } = require('./roleSimilarity');
const { VALID_STATUSES, STATUS_GROUPS }         = require('../../constants/applicationStatuses');

const CONFIDENT = 0.75;

// Classifications that prove an application exists even when nothing on
// file matches. GENERAL_RESPONSE / FOLLOW_UP_NEEDED are deliberately absent:
// job alerts and newsletters land there and must not become applications.
const DECISIVE_REPLIES = new Set(['INTERVIEW_INVITE', 'REJECTION', 'TECHNICAL_TEST', 'OFFER']);

function describe(classification) {
  return `${classification.classification}: ${classification.summary || ''}`.trim();
}

function replyStatus(classification) {
  const s = classification.suggested_status;
  return VALID_STATUSES.has(s) && s !== 'APPLIED' ? s : 'EMAIL_RECEIVED';
}

/**
 * Creates an application detected from an email and links the email to it.
 * A confirmation is recorded as APPLIED at the time the email arrived.
 *
 * @returns {Promise<{ id: number, company_name: string, job_title: string }>}
 */
async function createApplicationFromEmail(db, {
  emailResponseId, companyName, role, isConfirmation, status, receivedAt, eventDescription,
  createdAt = null, matchMethod = 'auto_created', createdDescription = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO applications
       (company_name, job_title, source_platform, entry_method, status, notes,
        applied_at, last_response_at, created_at, updated_at)
     VALUES ($1, $2, 'email', 'email_detected', $3, $4, $5, $6, COALESCE($7, NOW()), COALESCE($7, NOW()))
     RETURNING id, company_name, job_title`,
    [
      companyName,
      role || PLACEHOLDER_TITLE,
      status,
      'Auto-created from an inbound email — please review and fill in details.',
      isConfirmation ? receivedAt : null,
      isConfirmation ? null : new Date(),
      createdAt,
    ]
  );
  const app = rows[0];

  await db.query(
    `INSERT INTO application_events (application_id, event_type, description, event_date)
     VALUES ($1, 'APPLICATION_CREATED', $2, COALESCE($3, NOW()))`,
    [app.id, createdDescription || (isConfirmation
      ? 'Auto-created from an application confirmation email'
      : 'Auto-created from an inbound email'), createdAt]
  );
  if (eventDescription) {
    await db.query(
      `INSERT INTO application_events (application_id, event_type, description, event_date)
       VALUES ($1, 'EMAIL_RECEIVED', $2, COALESCE($3, NOW()))`,
      [app.id, eventDescription, createdAt]
    );
  }
  await db.query(
    `UPDATE email_responses
     SET application_id = $1, suggested_application_id = NULL, match_method = $2
     WHERE id = $3`,
    [app.id, matchMethod, emailResponseId]
  );
  return app;
}

async function applyConfirmation(db, app, { classification, extractedRole, receivedAt }) {
  // The email names the role an auto-created application was missing.
  if (extractedRole && isPlaceholderTitle(app.job_title)) {
    await db.query(
      'UPDATE applications SET job_title = $1, updated_at = NOW() WHERE id = $2',
      [extractedRole, app.id]
    );
  }

  // A confirmation only ever moves an application forward to APPLIED — it
  // must never pull one already further along back down.
  if (STATUS_GROUPS.prep.includes(app.status)) {
    await db.query(
      `UPDATE applications
       SET status = 'APPLIED', applied_at = COALESCE(applied_at, $1), updated_at = NOW()
       WHERE id = $2`,
      [receivedAt, app.id]
    );
    await db.query(
      `INSERT INTO application_events (application_id, event_type, description)
       VALUES ($1, 'STATUS_CHANGED', $2)`,
      [app.id, `Status changed from ${app.status} to APPLIED — confirmed by email`]
    );
  }
  await db.query(
    `INSERT INTO application_events (application_id, event_type, description)
     VALUES ($1, 'EMAIL_RECEIVED', $2)`,
    [app.id, describe(classification)]
  );
}

async function applyReply(db, app, { classification }) {
  await db.query(
    `UPDATE applications SET status = $1, last_response_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [replyStatus(classification), app.id]
  );
  await db.query(
    `INSERT INTO application_events (application_id, event_type, description)
     VALUES ($1, 'EMAIL_RECEIVED', $2)`,
    [app.id, describe(classification)]
  );
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} args
 * @param {string} args.sourceKey        mailbox the email came from
 * @param {number} args.emailResponseId  the email's email_responses row
 * @param {object} args.email            { sender_email, sender_name, thread_id, received_at }
 * @param {object} args.classification   emailClassificationService.classify() result
 * @returns {Promise<{ outcome: 'matched'|'suggested'|'created'|'unlinked', application?: object, method?: string }>}
 */
async function linkEmail(db, { sourceKey, emailResponseId, email, classification }) {
  const extractedCompany = (classification.extracted_company || '').trim();
  const extractedRole    = (classification.extracted_role    || '').trim();
  const isConfirmation   = classification.classification === 'APPLICATION_CONFIRMATION';
  const confident        = Number(classification.confidence) >= CONFIDENT;
  const receivedAt       = email.received_at || new Date();

  // Matching (who sent this) and classification confidence (what it means)
  // are independent — a strong match links the email even if the AI is
  // unsure what to do about it; only a confident classification changes
  // the application. See applicationMatchingService for scoring.
  const match = await applicationMatchingService.findMatch(db, {
    senderEmail:  email.sender_email,
    senderName:   email.sender_name,
    extractedCompany,
    extractedRole,
    isConfirmation,
    sourceAccount: sourceKey,
    threadId:      email.thread_id,
    receivedAt,
  });

  if (match.status === 'matched') {
    const app = match.application;
    await db.query(
      'UPDATE email_responses SET application_id = $1, match_method = $2 WHERE id = $3',
      [app.id, match.method, emailResponseId]
    );
    if (confident) {
      if (isConfirmation) await applyConfirmation(db, app, { classification, extractedRole, receivedAt });
      else                await applyReply(db, app, { classification });
    }
    return { outcome: 'matched', application: app, method: match.method };
  }

  if (match.status === 'suggested') {
    await db.query(
      'UPDATE email_responses SET suggested_application_id = $1, match_method = $2 WHERE id = $3',
      [match.application.id, match.method, emailResponseId]
    );
    return { outcome: 'suggested', application: match.application, method: match.method };
  }

  // Nothing on file is this application ('new' = known company, new role;
  // 'none' = unknown company). Record it when the email clearly proves one
  // exists, so applications made outside the dashboard are still tracked.
  const provesApplication = isConfirmation || DECISIVE_REPLIES.has(classification.classification);
  if (!confident || !extractedCompany || !provesApplication) return { outcome: 'unlinked' };

  const app = await createApplicationFromEmail(db, {
    emailResponseId,
    companyName:      match.companyName || extractedCompany,
    role:             extractedRole,
    isConfirmation,
    status:           isConfirmation ? 'APPLIED' : replyStatus(classification),
    receivedAt,
    eventDescription: describe(classification),
  });

  // Best-effort: pull in earlier unlinked emails that now have a home. Only
  // for a company seen for the first time (with several applications there
  // an old email is ambiguous), and never from a shared ATS address, where
  // one sender covers many unrelated companies.
  const senderDomain = applicationMatchingService.domainOf(email.sender_email);
  if (match.status === 'none' && senderDomain && !applicationMatchingService.isAtsDomain(senderDomain)) {
    await db.query(
      `UPDATE email_responses
       SET application_id = $1, match_method = 'auto_created'
       WHERE sender_email = $2 AND application_id IS NULL AND id <> $3
         AND lower(extracted_company) = lower($4)
         AND ai_classification <> 'APPLICATION_CONFIRMATION'`,
      [app.id, email.sender_email, emailResponseId, extractedCompany]
    );
  }

  return { outcome: 'created', application: app, method: 'auto_created' };
}

module.exports = { linkEmail, createApplicationFromEmail, CONFIDENT, DECISIVE_REPLIES };
