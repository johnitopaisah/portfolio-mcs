'use strict';
require('dotenv').config();
const pool                       = require('../db/client');
const gmailService               = require('../services/emailTracking/gmailService');
const imapService                = require('../services/emailTracking/imapService');
const emailClassificationService = require('../services/emailTracking/emailClassificationService');
const emailSyncLogService        = require('../services/emailTracking/emailSyncLogService');
const emailLinkingService        = require('../services/emailTracking/emailLinkingService');

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
          received_at, ai_classification, confidence_score, raw_label, extracted_company, extracted_role,
          thread_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        source.key, email.gmail_message_id, email.sender_email, email.sender_name,
        email.subject, email.body_snippet, email.received_at,
        classification?.classification || 'UNKNOWN',
        classification?.confidence     || 0,
        classification?.summary        || '',
        extractedCompany, extractedRole,
        email.thread_id || null,
      ]
    );
    inserted++;
    const emailResponseId = insertRes.rows[0].id;

    // Step 5: Link to the application this email is about, or record a new
    // one — see emailLinkingService. Every application is company + role,
    // so a confirmation for a second role at a company already on file
    // becomes its own application rather than joining the first.
    if (classification) {
      const result = await emailLinkingService.linkEmail(pool, {
        sourceKey: source.key,
        emailResponseId,
        email,
        classification,
      });

      if (result.outcome === 'matched') {
        matched++;
        console.log(`[EmailWorker:${source.key}] Matched email to application ${result.application.id} (${result.application.company_name}) via ${result.method}`);
      } else if (result.outcome === 'created') {
        matched++;
        console.log(`[EmailWorker:${source.key}] Auto-created application ${result.application.id} (${result.application.company_name} — ${result.application.job_title}) from email`);
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
