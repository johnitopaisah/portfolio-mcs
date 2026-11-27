'use strict';
require('dotenv').config();
const pool              = require('../db/client');
const { schemaReady }   = require('../db/migrations');
const { createOutbox }  = require('../services/outboxService');

// Daily (08:00 CronJob): draft follow-up emails to recruiters for approval.
//
// Nothing is sent from here. For each application still Applied 7–21 days
// after applying, with no response and a reachable recruiter address, a
// follow-up is drafted into the Outbox (AI-polished from your template).
// You then get ONE email listing the drafts with one-time "Review & send"
// links — or nothing, if your reminder channel is "In-app only" (the drafts
// wait in the Outbox). Previously this emailed you a generic "consider
// following up" nudge for every old application, every week.
const FOLLOW_UP_AFTER_DAYS = 7;
const STOP_AFTER_DAYS      = 21;   // following up after 3 weeks rarely helps
const MAX_NEW_PER_RUN      = parseInt(process.env.OUTBOX_MAX_NEW_DRAFTS || '5', 10);

async function runFollowUpWorker() {
  console.log('[FollowUpWorker] Starting…', new Date().toISOString());
  if (!(await schemaReady(pool, 'FollowUpWorker'))) return; // DB behind this image — skip run
  if (await require('../services/availability').isSearchPaused()) {
    console.log('[FollowUpWorker] Job search paused (availability: Not open) — no follow-ups drafted');
    return;
  }

  const { rows: candidates } = await pool.query(
    `SELECT id, company_name, job_title
     FROM applications
     WHERE status = 'APPLIED'
       AND applied_at <  NOW() - make_interval(days => $1)
       AND applied_at >= NOW() - make_interval(days => $2)
       AND last_response_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM outbound_emails o WHERE o.application_id = applications.id AND o.source = 'follow_up_rule')
     ORDER BY applied_at DESC`,
    [FOLLOW_UP_AFTER_DAYS, STOP_AFTER_DAYS]
  );
  console.log(`[FollowUpWorker] ${candidates.length} applications are due a follow-up`);

  const outbox = createOutbox();
  const drafted = [];
  for (const app of candidates) {
    if (drafted.length >= MAX_NEW_PER_RUN) break;
    try {
      const rej = await outbox.possibleRejectionFor(app.id);
      if (rej) { console.log(`[FollowUpWorker] ${app.company_name}: possible rejection (email #${rej.id}) waiting for confirmation in the Outbox — skipped`); continue; }
      const draft = await outbox.createFollowUpDraft(app.id);
      if (!draft) { console.log(`[FollowUpWorker] ${app.company_name}: no reachable recruiter address — skipped`); continue; }
      drafted.push(draft.id);
      await pool.query(
        `INSERT INTO application_events (application_id, event_type, description) VALUES ($1, 'FOLLOW_UP_NEEDED', $2)`,
        [app.id, `Follow-up email drafted for your approval (Outbox #${draft.id})`]);
      console.log(`[FollowUpWorker] Drafted follow-up #${draft.id} for ${app.company_name}`);
    } catch (err) {
      console.error(`[FollowUpWorker] Could not draft for app ${app.id}:`, err.message);
    }
  }

  if (drafted.length) {
    try {
      const r = await outbox.requestApproval(drafted);
      console.log(`[FollowUpWorker] Approval request: ${r.emailed ? `emailed (${r.count})` : `not emailed — channel ${r.channel}`}`);
    } catch (err) {
      // Drafts are safe in the Outbox; only the notification failed.
      console.error('[FollowUpWorker] Could not send the approval email:', err.message);
    }
  }
  console.log(`[FollowUpWorker] Done — ${drafted.length} drafted`);
}

setTimeout(() => { console.error('[FollowUpWorker] Timeout'); process.exit(1); }, 5 * 60 * 1000);
process.on('SIGTERM', () => process.exit(0));

runFollowUpWorker()
  .then(() => process.exit(0))
  .catch(err => { console.error('[FollowUpWorker] Fatal:', err); process.exit(1); });
