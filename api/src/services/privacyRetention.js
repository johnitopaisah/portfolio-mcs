'use strict';
/**
 * Privacy retention — enforces the time limits published on /privacy.
 * Runs hourly from index.js (idempotent, safe on every API pod).
 *
 *   visits (visitor_logs)           13 months → folded into visitor_daily totals, rows deleted
 *   contact form messages           12 months → deleted
 *   admin login log (auth_attempts) 90 days   → deleted
 *   referee contact requests        12 months after they close → deleted
 *   referee invitations             12 months after use/expiry → deleted
 *   recruiter data (job search)     12 months after the application closed:
 *                                     emails → sender, snippet, subject removed
 *                                     contacts, outbound emails → deleted
 *                                   unlinked recruiter emails: 12 months → deleted
 *   CV requests                     cvRequestService.retention() (90 days / 12 months)
 *   blog clicks                     blogClickService (90 days → daily totals)
 *
 * Database backups (Google Cloud Storage) expire after 14 days, so deleted
 * data is gone from backups within 14 days.
 */
const pool = require('../db/client');
const { FINAL_STATUSES } = require('../constants/applicationStatuses');

const VISIT_MONTHS = 13;
const BATCH = 5000;

async function foldOldVisits(db) {
  let total = 0;
  for (;;) {
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(`
        SELECT id FROM visitor_logs
        WHERE visited_at < NOW() - make_interval(months => $1)
        ORDER BY visited_at LIMIT $2 FOR UPDATE SKIP LOCKED`, [VISIT_MONTHS, BATCH]);
      if (!rows.length) { await c.query('ROLLBACK'); break; }
      const ids = rows.map(r => r.id);
      await c.query(`
        INSERT INTO visitor_daily (day, country, referer, device_type, visits)
        SELECT (visited_at AT TIME ZONE 'Europe/Paris')::date, COALESCE(country, country_code, 'Unknown'),
               COALESCE(referer_label, 'Direct'), COALESCE(device_type, 'desktop'), COUNT(*)
        FROM visitor_logs WHERE id = ANY($1) AND NOT is_bot GROUP BY 1, 2, 3, 4
        ON CONFLICT (day, country, referer, device_type) DO UPDATE SET visits = visitor_daily.visits + EXCLUDED.visits`, [ids]);
      await c.query('DELETE FROM visitor_logs WHERE id = ANY($1)', [ids]);
      await c.query('COMMIT');
      total += ids.length;
    } catch (err) {
      await c.query('ROLLBACK').catch(() => {});
      throw err;
    } finally { c.release(); }
  }
  return total;
}

async function runPrivacyRetention(db = pool) {
  const n = async (sql, params = []) => (await db.query(sql, params)).rowCount;
  const out = {};
  out.visits_folded = await foldOldVisits(db);
  out.contact_messages = await n(`DELETE FROM contact_messages WHERE created_at < NOW() - INTERVAL '12 months'`);
  out.login_log = await n(`DELETE FROM auth_attempts WHERE attempted_at < NOW() - INTERVAL '90 days'`);
  out.referee_requests = await n(`
    DELETE FROM referee_contact_requests
    WHERE status NOT IN ('submitted', 'approved', 'consent_requested', 'consent_given')
      -- when it closed: fulfilled / declined / referee answered, else when it expired
      AND COALESCE(fulfilled_at, declined_at, consent_responded_at, expires_at, created_at) < NOW() - INTERVAL '12 months'`);
  out.referee_invitations = await n(`
    DELETE FROM referee_invitations
    WHERE GREATEST(created_at, used_at, expires_at) < NOW() - INTERVAL '12 months'`);

  // recruiters: 12 months after the application closed (final status, untouched since)
  const closed = `SELECT id FROM applications WHERE status = ANY($1) AND updated_at < NOW() - INTERVAL '12 months'`;
  out.recruiter_emails_anonymised = await n(`
    UPDATE email_responses
    SET sender_email = NULL, sender_name = NULL, body_snippet = NULL, subject = '(removed — retention)'
    WHERE application_id IN (${closed}) AND (sender_email IS NOT NULL OR body_snippet IS NOT NULL)`, [FINAL_STATUSES]);
  out.recruiter_contacts = await n(`DELETE FROM application_contacts WHERE application_id IN (${closed})`, [FINAL_STATUSES]);
  out.outbound_emails = await n(`DELETE FROM outbound_emails WHERE application_id IN (${closed})`, [FINAL_STATUSES]);
  out.unlinked_emails = await n(`
    DELETE FROM email_responses WHERE application_id IS NULL AND received_at < NOW() - INTERVAL '12 months'`);
  return out;
}

module.exports = { runPrivacyRetention, VISIT_MONTHS };
