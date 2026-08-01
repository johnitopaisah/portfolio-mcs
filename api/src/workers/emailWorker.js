'use strict';
require('dotenv').config();
const pool                       = require('../db/client');
const gmailService               = require('../services/emailTracking/gmailService');
const imapService                = require('../services/emailTracking/imapService');
const emailClassificationService = require('../services/emailTracking/emailClassificationService');
const emailSyncLogService        = require('../services/emailTracking/emailSyncLogService');
const applicationMatchingService = require('../services/emailTracking/applicationMatchingService');
const { VALID_STATUSES }         = require('../constants/applicationStatuses');

const SOURCES = [
  { key: 'gmail', label: 'Gmail',        fetch: gmailService.fetchRecentEmails, enabled: true },
  { key: 'imap',  label: 'Professional', fetch: imapService.fetchRecentEmails,  enabled: !!process.env.IMAP_HOST },
];

// Step 1: per-source fetch window — since last email seen FROM THAT SOURCE, or 24h ago.
// Tracked independently so a quiet mailbox can't get stuck re-scanning a stale
// window, and a burst on one mailbox can't skip the other's window forward.
async function getSinceFor(sourceKey) {
  const { rows } = await pool.query(
    'SELECT MAX(received_at) AS last FROM email_responses WHERE source_account = $1',
    [sourceKey]
  );
  return rows[0].last ? new Date(rows[0].last) : new Date(Date.now() - 24 * 60 * 60 * 1000);
}

// Fetch + classify + match for a single mailbox. Isolated in its own try/catch
// at the call site so one mailbox failing (bad creds, provider downtime)
// never blocks the other from being processed.
async function processSource(source) {
  const t0 = Date.now();
  const since = await getSinceFor(source.key);
  const emails = await source.fetch(since);
  console.log(`[EmailWorker:${source.key}] Fetched ${emails.length} since ${since.toISOString()}`);

  let inserted = 0, matched = 0, skipped = 0;

  for (const email of emails) {
    // Step 2: Deduplicate by (source_account, gmail_message_id)
    const exists = await pool.query(
      'SELECT id FROM email_responses WHERE source_account = $1 AND gmail_message_id = $2',
      [source.key, email.gmail_message_id]
    );
    if (exists.rows.length > 0) { skipped++; continue; }

    // Step 3: Rule filter + AI classification
    const classification = await emailClassificationService.classify({
      subject:      email.subject,
      body_snippet: email.body_snippet,
      sender_email: email.sender_email,
      company_name: '',
      job_title:    '',
    });

    // Step 4: Insert email_responses row
    const extractedCompany = classification?.extracted_company || '';
    const extractedRole    = classification?.extracted_role    || '';
    const insertRes = await pool.query(
      `INSERT INTO email_responses
         (source_account, gmail_message_id, sender_email, sender_name, subject, body_snippet,
          received_at, ai_classification, confidence_score, raw_label, extracted_company, extracted_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        source.key, email.gmail_message_id, email.sender_email, email.sender_name,
        email.subject, email.body_snippet, email.received_at,
        classification?.classification || 'UNKNOWN',
        classification?.confidence     || 0,
        classification?.summary        || '',
        extractedCompany, extractedRole,
      ]
    );
    inserted++;
    const emailResponseId = insertRes.rows[0].id;

    // Step 5: Match to an application. Matching (who sent this) and
    // classification confidence (what it means) are independent — a
    // strong name/domain match links the email even if the AI is unsure
    // what to do about it; only a confident classification auto-advances
    // the application's status. See applicationMatchingService for scoring.
    if (classification) {
      const match = await applicationMatchingService.findMatch(pool, {
        senderEmail:      email.sender_email,
        senderName:       email.sender_name,
        extractedCompany,
        extractedRole,
      });

      if (match.status === 'matched') {
        const app = match.application;
        matched++;

        await pool.query(
          'UPDATE email_responses SET application_id = $1, match_method = $2 WHERE id = $3',
          [app.id, match.method, emailResponseId]
        );

        if (classification.confidence >= 0.75) {
          const newStatus = VALID_STATUSES.has(classification.suggested_status)
            ? classification.suggested_status
            : 'EMAIL_RECEIVED';
          await pool.query(
            `UPDATE applications SET status = $1, last_response_at = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [newStatus, app.id]
          );
          await pool.query(
            `INSERT INTO application_events (application_id, event_type, description)
             VALUES ($1, 'EMAIL_RECEIVED', $2)`,
            [app.id, `${classification.classification}: ${classification.summary}`]
          );
        }

        console.log(`[EmailWorker:${source.key}] Matched email to application ${app.id} (${app.company_name}) via ${match.method}`);
      } else if (match.status === 'suggested') {
        await pool.query(
          'UPDATE email_responses SET suggested_application_id = $1, match_method = $2 WHERE id = $3',
          [match.application.id, match.method, emailResponseId]
        );
      } else if (
        classification.confidence >= 0.75 &&
        classification.classification !== 'UNKNOWN' &&
        extractedCompany
      ) {
        // Step 6: nothing on file looks like a fit, but this clearly reads
        // as a real recruiting reply — create a minimal stub application so
        // the thread isn't lost, rather than leaving it orphaned. Flagged
        // via entry_method for review in the admin UI.
        const stubStatus = VALID_STATUSES.has(classification.suggested_status)
          ? classification.suggested_status
          : 'EMAIL_RECEIVED';

        const stubRes = await pool.query(
          `INSERT INTO applications (company_name, job_title, source_platform, entry_method, status, notes, last_response_at)
           VALUES ($1, $2, 'email', 'email_detected', $3, $4, NOW())
           RETURNING id, company_name`,
          [
            extractedCompany,
            extractedRole || 'Application via email',
            stubStatus,
            'Auto-created from an inbound email — please review and fill in details.',
          ]
        );
        const stub = stubRes.rows[0];

        await pool.query(
          `INSERT INTO application_events (application_id, event_type, description)
           VALUES ($1, 'APPLICATION_CREATED', 'Auto-created from an inbound email')`,
          [stub.id]
        );
        await pool.query(
          `INSERT INTO application_events (application_id, event_type, description)
           VALUES ($1, 'EMAIL_RECEIVED', $2)`,
          [stub.id, `${classification.classification}: ${classification.summary}`]
        );
        await pool.query(
          `UPDATE email_responses SET application_id = $1, match_method = 'auto_created' WHERE id = $2`,
          [stub.id, emailResponseId]
        );

        // Best-effort: pull in earlier emails from this same sender that
        // never matched anything, now that a home for them exists.
        await pool.query(
          `UPDATE email_responses
           SET application_id = $1, match_method = 'auto_created'
           WHERE sender_email = $2 AND application_id IS NULL AND id <> $3`,
          [stub.id, email.sender_email, emailResponseId]
        );

        matched++;
        console.log(`[EmailWorker:${source.key}] Auto-created application ${stub.id} (${stub.company_name}) from email`);
      }
    }
  }

  await emailSyncLogService.logSyncResult({
    sourceAccount: source.key,
    status:        'SUCCESS',
    emailsFetched: emails.length,
    emailsNew:     inserted,
    durationMs:    Date.now() - t0,
  });

  return { inserted, matched, skipped };
}

async function runEmailWorker() {
  console.log('[EmailWorker] Starting…', new Date().toISOString());
  const t0 = Date.now();

  const totals = { inserted: 0, matched: 0, skipped: 0 };

  for (const source of SOURCES) {
    if (!source.enabled) {
      console.log(`[EmailWorker:${source.key}] Skipped — not configured`);
      continue;
    }
    try {
      const result = await processSource(source);
      totals.inserted += result.inserted;
      totals.matched  += result.matched;
      totals.skipped   += result.skipped;
    } catch (err) {
      console.error(`[EmailWorker:${source.key}] Failed:`, err.message);
      await emailSyncLogService.logSyncResult({
        sourceAccount: source.key,
        status:        'FAILED',
        errorMessage:  err.message,
        durationMs:    Date.now() - t0,
      }).catch(() => {});
      // Continue to next source — one mailbox failing must not block the other.
    }
  }

  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`[EmailWorker] Done in ${secs}s — inserted: ${totals.inserted}, matched: ${totals.matched}, skipped (dupes): ${totals.skipped}`);
}

setTimeout(() => { console.error('[EmailWorker] Timeout'); process.exit(1); }, 10 * 60 * 1000);
process.on('SIGTERM', () => process.exit(0));

runEmailWorker()
  .then(() => process.exit(0))
  .catch(err => { console.error('[EmailWorker] Fatal:', err); process.exit(1); });
