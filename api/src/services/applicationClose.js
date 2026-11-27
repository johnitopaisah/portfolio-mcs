'use strict';
// "Close application" (Rejected / Withdrawn) from the Outbox or the
// application page, with Undo.
//
// Closing stops everything for the application: the DB triggers from
// migrations 038 and 044 close its reminders and cancel its unsent outbox
// emails (with a history entry), and the follow-up rule only drafts for
// Applied applications. close() remembers what was open so reopen() can put
// it back exactly — but only while nothing has changed since.

const pool = require('../db/client');
const { VALID_STATUSES } = require('../constants/applicationStatuses');

const CLOSE_STATUSES = ['REJECTED', 'WITHDRAWN'];
const LABEL = { REJECTED: 'rejected', WITHDRAWN: 'withdrawn' };
const VIA = { outbox: 'from the Outbox', application: 'from the application page', rejection_email: 'confirmed from a rejection email' };
const err = (status, message) => Object.assign(new Error(message), { status });

function createApplicationClose({ db = pool } = {}) {
  async function tx(fn) {
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  }

  /**
   * @param {number} applicationId
   * @param {'REJECTED'|'WITHDRAWN'} status
   * @param {{ via?: 'outbox'|'application'|'rejection_email', emailResponseId?: number }} opts
   * @returns {{ application, cancelled_emails: number, undo }}
   */
  async function close(applicationId, status, { via = 'application', emailResponseId = null } = {}) {
    if (!CLOSE_STATUSES.includes(status)) throw err(400, 'Status must be REJECTED or WITHDRAWN');
    return tx(async c => {
      const { rows: [app] } = await c.query(
        'SELECT id, status, last_response_at FROM applications WHERE id = $1 FOR UPDATE', [applicationId]);
      if (!app) throw err(404, 'Application not found');
      if (app.status === status) throw err(409, `This application is already marked ${LABEL[status]}`);

      const { rows: emails } = await c.query(
        `SELECT id, status FROM outbound_emails WHERE application_id = $1 AND status IN ('draft', 'pending_approval', 'approved')`,
        [applicationId]);
      const { rows: reminders } = await c.query(
        'SELECT id FROM application_reminders WHERE application_id = $1 AND is_done = FALSE', [applicationId]);

      let linked = null;
      if (emailResponseId) {
        const { rows: [er] } = await c.query(
          'SELECT id, application_id, suggested_application_id, match_method FROM email_responses WHERE id = $1 FOR UPDATE', [emailResponseId]);
        if (!er) throw err(404, 'Email not found');
        if (er.application_id && er.application_id !== applicationId) throw err(409, 'That email is already attached to another application');
        if (!er.application_id) {
          await c.query(
            `UPDATE email_responses SET application_id = $1, suggested_application_id = NULL, match_method = 'confirmed_by_you' WHERE id = $2`,
            [applicationId, emailResponseId]);
          linked = { id: er.id, suggested_application_id: er.suggested_application_id, match_method: er.match_method };
        }
      }

      const { rows: [updated] } = await c.query(
        `UPDATE applications SET status = $2, last_response_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
        [applicationId, status]);   // triggers: reminders closed, unsent emails cancelled
      await c.query(
        `INSERT INTO application_events (application_id, event_type, description) VALUES ($1, 'STATUS_CHANGED', $2)`,
        [applicationId, `Status changed from ${app.status} to ${status} — marked ${LABEL[status]} ${VIA[via] || ''}`.trim()
          + (emails.length ? `; ${emails.length} unsent email${emails.length > 1 ? 's' : ''} cancelled` : '')]);

      return {
        application: updated,
        cancelled_emails: emails.length,
        undo: {
          status, previous_status: app.status, previous_last_response_at: app.last_response_at,
          emails, reminders: reminders.map(r => r.id), linked_email: linked,
        },
      };
    });
  }

  /** Undo a close(): only if the application is still in the status close() set. */
  async function reopen(applicationId, undo = {}) {
    const { status, previous_status: prev } = undo;
    if (!CLOSE_STATUSES.includes(status) || !VALID_STATUSES.has(prev)) throw err(400, 'Nothing to undo');
    return tx(async c => {
      const { rows: [app] } = await c.query('SELECT id, status FROM applications WHERE id = $1 FOR UPDATE', [applicationId]);
      if (!app) throw err(404, 'Application not found');
      if (app.status !== status) throw err(409, 'The application has changed since — set its status from the application page');

      const { rows: [updated] } = await c.query(
        `UPDATE applications SET status = $2, last_response_at = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [applicationId, prev, undo.previous_last_response_at || null]);

      let restored = 0;
      for (const e of Array.isArray(undo.emails) ? undo.emails : []) {
        if (!['draft', 'pending_approval', 'approved'].includes(e?.status)) continue;
        await c.query('SAVEPOINT restore_one');
        try {
          const { rowCount } = await c.query(
            `UPDATE outbound_emails SET status = $3, cancel_reason = NULL, updated_at = NOW()
             WHERE id = $1 AND application_id = $2 AND status = 'cancelled' AND cancel_reason LIKE 'the application was closed%'`,
            [Number(e.id), applicationId, e.status]);
          if (rowCount) {
            await c.query(`INSERT INTO outbound_email_events (outbound_email_id, event, actor, detail) VALUES ($1, 'restored', 'you', $2)`,
              [Number(e.id), JSON.stringify({ status: e.status, reason: 'application reopened (undo)' })]);
            restored++;
          }
          await c.query('RELEASE SAVEPOINT restore_one');
        } catch { await c.query('ROLLBACK TO SAVEPOINT restore_one'); }   // e.g. a newer follow-up exists
      }
      const ids = (Array.isArray(undo.reminders) ? undo.reminders : []).map(Number).filter(Number.isInteger);
      if (ids.length) {
        await c.query('UPDATE application_reminders SET is_done = FALSE WHERE application_id = $1 AND id = ANY($2)', [applicationId, ids]);
      }
      const l = undo.linked_email;
      if (l && Number.isInteger(Number(l.id))) {
        await c.query(
          `UPDATE email_responses SET application_id = NULL, suggested_application_id = $3, match_method = $4
           WHERE id = $1 AND application_id = $2 AND match_method = 'confirmed_by_you'`,
          [Number(l.id), applicationId, l.suggested_application_id ?? null, l.match_method ?? null]);
      }
      await c.query(
        `INSERT INTO application_events (application_id, event_type, description) VALUES ($1, 'STATUS_CHANGED', $2)`,
        [applicationId, `Undo: status back from ${status} to ${prev}`]);
      return { application: updated, restored_emails: restored };
    });
  }

  return { close, reopen };
}

module.exports = { createApplicationClose, CLOSE_STATUSES };
