'use strict';
require('dotenv').config();
const pool                = require('../db/client');
const notificationService = require('../services/jobIngestion/notificationService');

const FOLLOW_UP_AFTER_DAYS = 7;

async function runFollowUpWorker() {
  console.log('[FollowUpWorker] Starting…', new Date().toISOString());

  // Find applications that are APPLIED, older than 7 days, with no response yet,
  // and have not already received a FOLLOW_UP_NEEDED event in the last 7 days.
  const result = await pool.query(
    `SELECT id, company_name, job_title, applied_at
     FROM applications
     WHERE status = 'APPLIED'
       AND applied_at < NOW() - INTERVAL '${FOLLOW_UP_AFTER_DAYS} days'
       AND last_response_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM application_events
         WHERE application_id = applications.id
           AND event_type = 'FOLLOW_UP_NEEDED'
           AND event_date > NOW() - INTERVAL '7 days'
       )`
  );

  console.log(`[FollowUpWorker] ${result.rows.length} applications need follow-up`);

  for (const app of result.rows) {
    // Insert FOLLOW_UP_NEEDED event
    await pool.query(
      `INSERT INTO application_events (application_id, event_type, description)
       VALUES ($1, 'FOLLOW_UP_NEEDED', $2)`,
      [app.id, `No response after ${FOLLOW_UP_AFTER_DAYS} days — consider following up`]
    );

    // Send notification via existing notification service
    try {
      await notificationService.sendNotification({
        subject: `Follow-up reminder: ${app.job_title} at ${app.company_name}`,
        html: `
          <p>You applied to <strong>${app.job_title}</strong> at <strong>${app.company_name}</strong>
          on ${new Date(app.applied_at).toLocaleDateString()} — ${FOLLOW_UP_AFTER_DAYS} days ago.</p>
          <p>No response has been recorded yet. Consider sending a follow-up message.</p>
        `,
      });
    } catch (notifyErr) {
      // Notification failure is non-fatal — the event is already inserted
      console.error(`[FollowUpWorker] Notification failed for app ${app.id}:`, notifyErr.message);
    }

    console.log(`[FollowUpWorker] Follow-up event created for app ${app.id} (${app.company_name})`);
  }

  console.log('[FollowUpWorker] Done');
}

setTimeout(() => { console.error('[FollowUpWorker] Timeout'); process.exit(1); }, 5 * 60 * 1000);
process.on('SIGTERM', () => process.exit(0));

runFollowUpWorker()
  .then(() => process.exit(0))
  .catch(err => { console.error('[FollowUpWorker] Fatal:', err); process.exit(1); });
