'use strict';

const express             = require('express');
const pool                = require('../db/client');
const { requireAuth }     = require('../middleware/auth');
const { generateDraft }   = require('../services/emailDraftService');

const router = express.Router();

const SEL = `id, name, category, subject_template AS subject, body_template AS body, is_system, created_at, updated_at`;

// GET /api/email-templates
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const cat = req.query.category;
    const q   = cat
      ? pool.query(`SELECT ${SEL} FROM email_templates WHERE category=$1 ORDER BY is_system DESC, name`, [cat])
      : pool.query(`SELECT ${SEL} FROM email_templates ORDER BY is_system DESC, category, name`);
    const { rows } = await q;
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/email-templates/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${SEL} FROM email_templates WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/email-templates  (user-created only)
router.post('/', requireAuth, async (req, res, next) => {
  const { name, category, subject, body } = req.body;
  if (!name || !body) {
    return res.status(400).json({ error: 'name and body required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO email_templates (name, category, subject_template, body_template)
       VALUES ($1,$2,$3,$4) RETURNING ${SEL}`,
      [name, category || 'general', subject || '', body]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/email-templates/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  const { name, category, subject, body } = req.body;
  try {
    const { rows: existing } = await pool.query(
      'SELECT is_system FROM email_templates WHERE id=$1', [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Not found' });
    if (existing[0].is_system && (subject !== undefined || body !== undefined)) {
      return res.status(403).json({ error: 'System templates cannot be edited — duplicate first' });
    }
    const { rows } = await pool.query(
      `UPDATE email_templates
       SET name=$1, category=$2, subject_template=$3, body_template=$4, updated_at=NOW()
       WHERE id=$5 RETURNING ${SEL}`,
      [name, category || 'general', subject || '', body, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/email-templates/:id  (user-created only)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT is_system FROM email_templates WHERE id=$1', [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    if (rows[0].is_system) return res.status(403).json({ error: 'Cannot delete system templates' });
    await pool.query('DELETE FROM email_templates WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/email-templates/:id/duplicate
router.post('/:id/duplicate', requireAuth, async (req, res, next) => {
  try {
    const { rows: src } = await pool.query('SELECT * FROM email_templates WHERE id=$1', [req.params.id]);
    if (!src.length) return res.status(404).json({ error: 'Not found' });
    const s = src[0];
    const { rows } = await pool.query(
      `INSERT INTO email_templates (name, category, subject_template, body_template)
       VALUES ($1,$2,$3,$4) RETURNING ${SEL}`,
      [`${s.name} (copy)`, s.category, s.subject_template, s.body_template]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/email-templates/:id/draft?application=:appId
router.post('/:id/draft', requireAuth, async (req, res, next) => {
  const appId = req.query.application || req.body.application_id;
  if (!appId) return res.status(400).json({ error: 'application query param required' });
  try {
    const draft = await generateDraft(appId, req.params.id);
    res.json(draft);
  } catch (err) { next(err); }
});

// ── Per-application communications ───────────────────────────────────
// GET /api/email-templates/communications/:appId
router.get('/communications/:appId', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT ac.*, et.name AS template_name, et.category AS template_category
      FROM application_communications ac
      LEFT JOIN email_templates et ON et.id = ac.template_id
      WHERE ac.application_id = $1
      ORDER BY ac.sent_at DESC
    `, [req.params.appId]);
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/email-templates/communications/:appId
router.post('/communications/:appId', requireAuth, async (req, res, next) => {
  const { template_id, comm_type, direction, subject, body, sent_to, sent_from, sent_at, channel, note } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO application_communications
         (application_id, template_id, comm_type, direction, subject, body,
          sent_to, sent_from, sent_at, channel, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        req.params.appId, template_id || null, comm_type || 'email',
        direction || 'outbound', subject || null, body || null,
        sent_to || null, sent_from || null, sent_at || new Date(),
        channel || null, note || null,
      ]
    );

    // Add event to application timeline
    await pool.query(
      `INSERT INTO application_events (application_id, event_type, description)
       VALUES ($1,'COMMUNICATION_SENT',$2)`,
      [req.params.appId, `${comm_type || 'Email'} sent: ${subject || '(no subject)'}`]
    );

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── LinkedIn outreach ─────────────────────────────────────────────────
// GET /api/email-templates/linkedin/:appId
router.get('/linkedin/:appId', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM linkedin_outreach WHERE application_id=$1 ORDER BY sent_at DESC',
      [req.params.appId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/email-templates/linkedin/:appId
router.post('/linkedin/:appId', requireAuth, async (req, res, next) => {
  const { contact_name, contact_title, linkedin_url, message_sent, sent_at, status, note } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO linkedin_outreach
         (application_id, contact_name, contact_title, linkedin_url,
          message_sent, sent_at, status, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        req.params.appId, contact_name || null, contact_title || null,
        linkedin_url || null, message_sent || null,
        sent_at || new Date(), status || 'sent', note || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /api/email-templates/linkedin/:appId/:id
router.patch('/linkedin/:appId/:id', requireAuth, async (req, res, next) => {
  const { status, replied_at, meeting_booked_at, note } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE linkedin_outreach
       SET status=$1, replied_at=$2, meeting_booked_at=$3, note=$4
       WHERE id=$5 AND application_id=$6 RETURNING *`,
      [status, replied_at || null, meeting_booked_at || null, note || null,
       req.params.id, req.params.appId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/email-templates/linkedin/:appId/:id
router.delete('/linkedin/:appId/:id', requireAuth, async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM linkedin_outreach WHERE id=$1 AND application_id=$2',
      [req.params.id, req.params.appId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
