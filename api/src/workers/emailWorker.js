'use strict';
require('dotenv').config();
const pool                       = require('../db/client');
const gmailService               = require('../services/emailTracking/gmailService');
const imapSyncService            = require('../services/emailTracking/imapSyncService');
const emailClassificationService = require('../services/emailTracking/emailClassificationService');
const emailSyncLogService        = require('../services/emailTracking/emailSyncLogService');
const emailLinkingService        = require('../services/emailTracking/emailLinkingService');

// CLI: --backfill-days=N  re-scan the last N days of every IMAP folder
//                         (duplicates are skipped by Message-ID; safe to repeat)
//      --only=imap|gmail  run a single mailbox
const ARGS = Object.fromEntries(process.argv.slice(2)
  .filter(a => a.startsWith('--'))
  .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? 'true']; }));
const BACKFILL_DAYS = parseInt(ARGS['backfill-days'] || process.env.EMAIL_BACKFILL_DAYS || '', 10) || null;
const ONLY          = ARGS.only || null;

const SOURCES = [
  { key: 'gmail', label: 'Gmail',        run: processSource,   fetch: gmailService.fetchRecentEmails, enabled: true },
  { key: 'imap',  label: 'Professional', run: processImapSource,                                      enabled: !!process.env.IMAP_HOST },
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

// Professional mailbox: every folder, UID watermarks, Message-ID dedupe —
// see imapSyncService.js.
async function processImapSource(source) {
  const t0 = Date.now();
  const r  = await imapSyncService.syncImapMailbox({
    db: pool, sourceKey: source.key,
    overrides: { backfillDays: BACKFILL_DAYS },
  });

  for (const f of r.folders) {
    console.log(`[EmailWorker:${source.key}]   ${f.path.padEnd(14)} ` + (f.error
      ? `ERROR ${f.error}`
      : `${f.mode} scanned=${f.scanned} new-candidates=${f.candidates} dupes=${f.duplicates} own=${f.ignored} not-job=${f.irrelevant}${f.truncated ? ' (more next run)' : ''}`));
  }

  await emailSyncLogService.logSyncResult({
    sourceAccount: source.key,
    status:        r.status,
    emailsFetched: r.fetched,
    emailsNew:     r.inserted,
    errorMessage:  r.errors.length ? r.errors.slice(0, 5).join(' | ').slice(0, 1000) : null,
    durationMs:    Date.now() - t0,
    details: {
      pending_review: r.pending,
      halted:         r.halted,
      backfill_days:  BACKFILL_DAYS,
      folders: r.folders.map(f => ({
        path: f.path, spam: f.isSpam, mode: f.mode, scanned: f.scanned, new: f.candidates,
        duplicates: f.duplicates, own: f.ignored, not_job: f.irrelevant, error: f.error || null,
      })),
    },
  });

  return { inserted: r.inserted, matched: r.matched, skipped: 0 };
}

async function runEmailWorker() {
  console.log('[EmailWorker] Starting…', new Date().toISOString());
  const t0 = Date.now();

  const totals = { inserted: 0, matched: 0, skipped: 0 };

  for (const source of SOURCES) {
    if (ONLY && ONLY !== source.key) continue;
    if (!source.enabled) {
      console.log(`[EmailWorker:${source.key}] Skipped — not configured`);
      continue;
    }
    try {
      const result = await source.run(source);
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

// A backfill classifies far more mail than a 5-minute run.
setTimeout(() => { console.error('[EmailWorker] Timeout'); process.exit(1); }, (BACKFILL_DAYS ? 45 : 10) * 60 * 1000).unref();
process.on('SIGTERM', () => process.exit(0));

runEmailWorker()
  .then(() => process.exit(0))
  .catch(err => { console.error('[EmailWorker] Fatal:', err); process.exit(1); });
