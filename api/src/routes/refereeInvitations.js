'use strict';

const crypto  = require('crypto');
const router  = require('express').Router();
const pool    = require('../db/client');
const { requireAuth }              = require('../middleware/auth');
const { notifyRefereeEvent, notifyModificationRequest, sendRefereeInvitationEmail } = require('../services/notify');
const multer  = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });
const uploadFields = upload.fields([
  { name: 'photo',    maxCount: 1 },
  { name: 'org_logo', maxCount: 1 },
]);

function siteUrl() {
  return (process.env.SITE_URL || 'https://johnisah.com').replace(/\/$/, '');
}

function adminUrl() {
  return (process.env.ADMIN_URL || 'https://admin.johnisah.com').replace(/\/$/, '');
}

// ── GET /validate?token=xxx  (public) ────────────────────────
router.get('/validate', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const { rows } = await pool.query(
      `SELECT i.*, r.name, r.title, r.organization, r.relationship,
              r.review, r.linkedin_url, r.email, r.phone,
              r.available_on_request, r.visible, r.star_config,
              (r.photo IS NOT NULL)    AS has_photo,
              (r.org_logo IS NOT NULL) AS has_org_logo
       FROM referee_invitations i
       LEFT JOIN referees r ON r.id = i.referee_id
       WHERE i.token = $1`,
      [token]
    );

    if (!rows.length) return res.status(404).json({ error: 'Invalid link' });

    const inv     = rows[0];
    const expired = new Date(inv.expires_at) < new Date();

    // Used but not yet expired → return read-only referee data so they can review
    if (inv.used && !expired && inv.referee_id) {
      return res.json({
        valid:  false,
        reason: 'used',
        usedAt: inv.used_at,
        expiresAt: inv.expires_at,
        referee: {
          id:                   inv.referee_id,
          name:                 inv.name,
          title:                inv.title,
          organization:         inv.organization,
          relationship:         inv.relationship,
          review:               inv.review,
          linkedin_url:         inv.linkedin_url,
          email:                inv.available_on_request ? null : inv.email,
          phone:                inv.available_on_request ? null : inv.phone,
          available_on_request: inv.available_on_request,
          has_photo:            inv.has_photo,
          has_org_logo:         inv.has_org_logo,
          star_config:          inv.star_config,
        },
      });
    }

    // Used + expired, or used with no referee linked
    if (inv.used) return res.json({ valid: false, reason: 'used_expired', usedAt: inv.used_at });

    // Not used but expired
    if (expired) return res.json({ valid: false, reason: 'expired', expiredAt: inv.expires_at });

    const payload = { valid: true, type: inv.type, expiresAt: inv.expires_at };

    if (inv.type === 'modify' && inv.referee_id) {
      payload.existing = {
        name:                 inv.name,
        title:                inv.title,
        organization:         inv.organization,
        relationship:         inv.relationship,
        review:               inv.review,
        linkedin_url:         inv.linkedin_url,
        email:                inv.email,
        phone:                inv.phone,
        available_on_request: inv.available_on_request,
        visible:              inv.visible,
        has_photo:            inv.has_photo,
        has_org_logo:         inv.has_org_logo,
        star_config:          inv.star_config,
        referee_id:           inv.referee_id,
      };
    }

    res.json(payload);
  } catch (err) { next(err); }
});

// ── GET /  (admin) — list all invitations ────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.note, i.type, i.expires_at, i.used, i.used_at, i.created_at,
              i.referee_id, r.name AS referee_name
       FROM referee_invitations i
       LEFT JOIN referees r ON r.id = i.referee_id
       ORDER BY i.created_at DESC`
    );
    res.json(rows.map(r => ({
      ...r,
      link:    `${siteUrl()}/referee-form?token=${r.id}`, // expose id as lookup key only for admin
      expired: new Date(r.expires_at) < new Date(),
    })));
  } catch (err) { next(err); }
});

// ── POST /  (admin) — create new 'create' invitation ─────────
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { note, days, referee_email } = req.body;
    const expiryDays = Math.min(Math.max(parseInt(days || '30'), 1), 365);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    const link = `${siteUrl()}/referee-form?token=${token}`;

    const { rows } = await pool.query(
      `INSERT INTO referee_invitations (token, note, type, expires_at, referee_email)
       VALUES ($1, $2, 'create', $3, $4)
       RETURNING id, token, note, type, expires_at, referee_email, created_at`,
      [token, note || null, expiresAt, referee_email || null]
    );

    if (referee_email) {
      sendRefereeInvitationEmail({ to: referee_email, link, expiresAt, isModify: false })
        .catch(err => console.error('[notify] referee invitation email failed:', err));
    }

    res.status(201).json({ ...rows[0], link, email_sent: !!referee_email });
  } catch (err) { next(err); }
});

// ── POST /for-referee/:refereeId  (admin) — 'modify' link ────
router.post('/for-referee/:refereeId', requireAuth, async (req, res, next) => {
  try {
    const { refereeId } = req.params;
    const { note, days, referee_email } = req.body;

    const ref = await pool.query('SELECT id, name FROM referees WHERE id = $1', [refereeId]);
    if (!ref.rows.length) return res.status(404).json({ error: 'Referee not found' });

    const expiryDays = Math.min(Math.max(parseInt(days || '14'), 1), 365);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
    const link = `${siteUrl()}/referee-form?token=${token}`;

    const { rows } = await pool.query(
      `INSERT INTO referee_invitations (token, note, type, referee_id, expires_at, referee_email)
       VALUES ($1, $2, 'modify', $3, $4, $5)
       RETURNING id, token, note, type, referee_id, expires_at, referee_email, created_at`,
      [token, note || `Modification link for ${ref.rows[0].name}`, refereeId, expiresAt, referee_email || null]
    );

    if (referee_email) {
      sendRefereeInvitationEmail({ to: referee_email, link, expiresAt, isModify: true })
        .catch(err => console.error('[notify] referee mod email failed:', err));
    }

    res.status(201).json({ ...rows[0], link, email_sent: !!referee_email });
  } catch (err) { next(err); }
});

// ── DELETE /:id  (admin) — revoke invitation ─────────────────
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM referee_invitations WHERE id = $1 AND used = false`,
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Invitation not found or already used' });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── POST /:token/submit  (public) — create or update referee ─
router.post('/:token/submit', uploadFields, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inv = await client.query(
      'SELECT * FROM referee_invitations WHERE token = $1',
      [req.params.token]
    );
    if (!inv.rows.length)                      return res.status(404).json({ error: 'Invalid link' });
    const invitation = inv.rows[0];
    if (invitation.used)                       return res.status(409).json({ error: 'already_used' });
    if (new Date(invitation.expires_at) < new Date()) return res.status(410).json({ error: 'expired' });

    const {
      name, title, organization, relationship, review,
      linkedin_url, email, phone, available_on_request, visible, order_index,
      star_config: starConfigRaw,
    } = req.body;

    const photo    = req.files?.photo?.[0];
    const org_logo = req.files?.org_logo?.[0];
    const availReq = available_on_request === 'true' || available_on_request === true;
    const vis      = visible !== 'false' && visible !== false;
    let starConfig = null;
    if (starConfigRaw) {
      try { starConfig = JSON.parse(starConfigRaw); } catch { /* ignore malformed */ }
    }

    let refereeId;

    if (invitation.type === 'create') {
      const { rows } = await client.query(
        `INSERT INTO referees
           (name, title, organization, relationship, review, linkedin_url,
            email, phone, available_on_request, visible,
            photo, photo_mime, org_logo, org_logo_mime, order_index, star_config)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id, name`,
        [
          name, title, organization, relationship,
          review || null, linkedin_url || null,
          email || null, phone || null, availReq, vis,
          photo?.buffer || null, photo?.mimetype || null,
          org_logo?.buffer || null, org_logo?.mimetype || null,
          parseInt(order_index || '0'),
          starConfig ? JSON.stringify(starConfig) : null,
        ]
      );
      refereeId = rows[0].id;

      await client.query(
        `UPDATE referee_invitations
         SET used = true, used_at = NOW(), referee_id = $1 WHERE token = $2`,
        [refereeId, req.params.token]
      );
    } else {
      refereeId = invitation.referee_id;

      await client.query(
        `UPDATE referees SET
           name                 = COALESCE($1,  name),
           title                = COALESCE($2,  title),
           organization         = COALESCE($3,  organization),
           relationship         = COALESCE($4,  relationship),
           review               = COALESCE($5,  review),
           linkedin_url         = COALESCE($6,  linkedin_url),
           email                = COALESCE($7,  email),
           phone                = COALESCE($8,  phone),
           available_on_request = COALESCE($9,  available_on_request),
           visible              = COALESCE($10, visible),
           photo                = COALESCE($11, photo),
           photo_mime           = COALESCE($12, photo_mime),
           org_logo             = COALESCE($13, org_logo),
           org_logo_mime        = COALESCE($14, org_logo_mime),
           star_config          = COALESCE($15, star_config),
           modification_requested    = false,
           modification_requested_at = NULL
         WHERE id = $16`,
        [
          name || null, title || null, organization || null, relationship || null,
          review || null, linkedin_url || null,
          email || null, phone || null,
          available_on_request !== undefined ? availReq : null,
          visible !== undefined ? vis : null,
          photo?.buffer || null, photo?.mimetype || null,
          org_logo?.buffer || null, org_logo?.mimetype || null,
          starConfig ? JSON.stringify(starConfig) : null,
          refereeId,
        ]
      );

      await client.query(
        'UPDATE referee_invitations SET used = true, used_at = NOW() WHERE token = $1',
        [req.params.token]
      );
    }

    await client.query('COMMIT');

    notifyRefereeEvent({
      name,
      type: invitation.type,
      adminUrl: `${adminUrl()}/dashboard/referees`,
    }).catch(err => console.error('[notify] referee event failed:', err));

    res.json({ success: true, name, type: invitation.type });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── POST /:token/request-modification  (public) ───────────────
router.post('/:token/request-modification', async (req, res, next) => {
  try {
    const inv = await pool.query(
      'SELECT * FROM referee_invitations WHERE token = $1',
      [req.params.token]
    );
    if (!inv.rows.length || !inv.rows[0].referee_id) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const invitation = inv.rows[0];

    const ref = await pool.query(
      `UPDATE referees
       SET modification_requested = true, modification_requested_at = NOW()
       WHERE id = $1
       RETURNING name`,
      [invitation.referee_id]
    );

    const name = ref.rows[0]?.name || 'Unknown';

    notifyModificationRequest({
      name,
      adminUrl: `${adminUrl()}/dashboard/referees`,
    }).catch(err => console.error('[notify] mod request failed:', err));

    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
