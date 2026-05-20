'use strict';
require('dotenv').config();
const pool                       = require('../db/client');
const gmailService               = require('../services/emailTracking/gmailService');
const emailClassificationService = require('../services/emailTracking/emailClassificationService');

async function runEmailWorker() {
  console.log('[EmailWorker] Starting…', new Date().toISOString());
  const t0 = Date.now();

  // Step 1: Determine fetch window — since last processed email or 24h ago
  const lastRes = await pool.query(
    'SELECT MAX(received_at) AS last FROM email_responses'
  );
  const since = lastRes.rows[0].last
    ? new Date(lastRes.rows[0].last)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Step 2: Fetch emails from Gmail
  const emails = await gmailService.fetchRecentEmails(since);
  console.log(`[EmailWorker] Fetched ${emails.length} emails since ${since.toISOString()}`);

  let inserted = 0, matched = 0, skipped = 0;

  for (const email of emails) {
    // Step 3: Deduplicate by gmail_message_id
    const exists = await pool.query(
      'SELECT id FROM email_responses WHERE gmail_message_id = $1',
      [email.gmail_message_id]
    );
    if (exists.rows.length > 0) { skipped++; continue; }

    // Step 4: Rule filter + AI classification
    const classification = await emailClassificationService.classify({
      subject:      email.subject,
      body_snippet: email.body_snippet,
      sender_email: email.sender_email,
      company_name: '',  // unknown at this stage
      job_title:    '',
    });

    // Step 5: Insert email_responses row
    const insertRes = await pool.query(
      `INSERT INTO email_responses
         (gmail_message_id, sender_email, sender_name, subject, body_snippet,
          received_at, ai_classification, confidence_score, raw_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        email.gmail_message_id, email.sender_email, email.sender_name,
        email.subject, email.body_snippet, email.received_at,
        classification?.classification || 'UNKNOWN',
        classification?.confidence     || 0,
        classification?.summary        || '',
      ]
    );
    inserted++;
    const emailResponseId = insertRes.rows[0].id;

    // Step 6: Match to an application by sender domain (confidence threshold: 0.75)
    if (classification && classification.confidence >= 0.75) {
      const domain = email.sender_email.split('@')[1];
      if (domain) {
        const appRes = await pool.query(
          `SELECT id, company_name, job_title FROM applications
           WHERE company_domain = $1 OR company_name ILIKE $2
           ORDER BY created_at DESC LIMIT 1`,
          [domain, `%${domain.split('.')[0]}%`]
        );

        if (appRes.rows.length > 0) {
          const app = appRes.rows[0];
          matched++;

          // Link email to application
          await pool.query(
            'UPDATE email_responses SET application_id = $1 WHERE id = $2',
            [app.id, emailResponseId]
          );

          // Update application status and last_response_at
          const newStatus = classification.suggested_status || 'EMAIL_RECEIVED';
          await pool.query(
            `UPDATE applications SET status = $1, last_response_at = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [newStatus, app.id]
          );

          // Create application event
          await pool.query(
            `INSERT INTO application_events (application_id, event_type, description)
             VALUES ($1, 'EMAIL_RECEIVED', $2)`,
            [app.id, `${classification.classification}: ${classification.summary}`]
          );

          console.log(`[EmailWorker] Matched email to application ${app.id} (${app.company_name})`);
        }
      }
    }
  }

  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`[EmailWorker] Done in ${secs}s — inserted: ${inserted}, matched: ${matched}, skipped (dupes): ${skipped}`);
}

setTimeout(() => { console.error('[EmailWorker] Timeout'); process.exit(1); }, 10 * 60 * 1000);
process.on('SIGTERM', () => process.exit(0));

runEmailWorker()
  .then(() => process.exit(0))
  .catch(err => { console.error('[EmailWorker] Fatal:', err); process.exit(1); });
