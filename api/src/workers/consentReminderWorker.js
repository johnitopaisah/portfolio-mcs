'use strict';

const pool = require('../db/client');
const {
  sendContactRequestConsentReminder,
} = require('../services/notify');

const REMINDER_INTERVAL_DAYS = 3;
const MAX_REMINDERS = 3;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // run once every 24 hours

async function runConsentReminderJob() {
  console.log('[ConsentReminder] Running consent reminder job...');

  try {
    // 1. Auto-expire requests where consent token has expired and status is still consent_requested
    const { rowCount: expiredCount } = await pool.query(
      `UPDATE referee_contact_requests
       SET status = 'expired'
       WHERE status = 'consent_requested'
         AND consent_token_expires_at < NOW()`
    );
    if (expiredCount > 0) {
      console.log(`[ConsentReminder] Expired ${expiredCount} stale consent request(s)`);
    }

    // 2. Find requests due for a reminder:
    //    - status = consent_requested
    //    - reminder_count < MAX_REMINDERS
    //    - either never reminded and consent_requested_at >= INTERVAL days ago
    //    - or last reminded >= INTERVAL days ago
    //    - token not yet expired
    const { rows: due } = await pool.query(
      `SELECT
         rcr.id,
         rcr.requester_name,
         rcr.requester_company,
         rcr.consent_token,
         rcr.consent_token_expires_at,
         rcr.consent_reminder_count,
         r.name  AS referee_name,
         r.email AS referee_email
       FROM referee_contact_requests rcr
       JOIN referees r ON r.id = rcr.referee_id
       WHERE rcr.status = 'consent_requested'
         AND rcr.consent_reminder_count < $1
         AND rcr.consent_token_expires_at > NOW()
         AND (
           (rcr.consent_last_reminded_at IS NULL
            AND rcr.consent_requested_at <= NOW() - INTERVAL '${REMINDER_INTERVAL_DAYS} days')
           OR
           (rcr.consent_last_reminded_at <= NOW() - INTERVAL '${REMINDER_INTERVAL_DAYS} days')
         )`,
      [MAX_REMINDERS]
    );

    if (due.length === 0) {
      console.log('[ConsentReminder] No reminders due.');
      return;
    }

    console.log(`[ConsentReminder] Sending ${due.length} reminder(s)...`);

    for (const row of due) {
      try {
        if (!row.referee_email) {
          console.warn(`[ConsentReminder] Skipping request ${row.id} — referee has no email`);
          continue;
        }

        const base        = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
        const acceptLink  = `${base}/api/referee-contact-requests/consent/accept?token=${row.consent_token}`;
        const declineLink = `${base}/api/referee-contact-requests/consent/decline?token=${row.consent_token}`;
        const reminderNum = row.consent_reminder_count + 1;

        await sendContactRequestConsentReminder({
          refereeEmail:    row.referee_email,
          refereeName:     row.referee_name,
          requesterName:   row.requester_name,
          requesterCompany: row.requester_company,
          acceptLink,
          declineLink,
          expiresAt:       row.consent_token_expires_at,
          reminderNumber:  reminderNum,
        });

        await pool.query(
          `UPDATE referee_contact_requests
           SET consent_reminder_count   = consent_reminder_count + 1,
               consent_last_reminded_at = NOW()
           WHERE id = $1`,
          [row.id]
        );

        console.log(`[ConsentReminder] Reminder ${reminderNum}/${MAX_REMINDERS} sent — request ${row.id}`);
      } catch (err) {
        console.error(`[ConsentReminder] Failed for request ${row.id}:`, err.message || err);
      }
    }
  } catch (err) {
    console.error('[ConsentReminder] Job error:', err.message || err);
  }
}

function startConsentReminderWorker() {
  // Run immediately on start (catches anything that accumulated), then every 24h
  runConsentReminderJob();
  setInterval(runConsentReminderJob, CHECK_INTERVAL_MS);
  console.log('[ConsentReminder] Worker started — checking every 24 hours');
}

module.exports = { startConsentReminderWorker };
