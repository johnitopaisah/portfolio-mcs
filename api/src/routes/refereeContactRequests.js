'use strict';

const router    = require('express').Router();
const pool      = require('../db/client');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const {
  sendContactRequestSubmittedToRequester,
  sendContactRequestNewToAdmin,
  sendContactRequestConsentToReferee,
  sendContactRequestConsentResponseToAdmin,
  sendContactRequestFulfilledToRequester,
  sendContactRequestFulfilledToReferee,
  sendContactRequestDeclinedToRequester,
} = require('../services/notify');
const {
  refereeContactRequestsTotal,
  refereeConsentResponsesTotal,
} = require('../metrics');

// Rate limit: 3 submissions per 15 min per IP
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
  },
});

function apiUrl() {
  return (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
}

function adminUrl() {
  return (process.env.ADMIN_URL || 'http://localhost:3001').replace(/\/$/, '');
}

// Simple inline HTML page for referee consent responses (served directly by API)
function consentHtmlPage(title, body, isSuccess = true) {
  const accentColor = isSuccess ? '#059669' : '#7c3aed';
  const icon        = isSuccess ? '✓' : '✕';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — johnisah.com</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #09090b; color: #f4f4f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 48px 40px; max-width: 480px; width: 100%; text-align: center; }
    .icon { width: 64px; height: 64px; border-radius: 50%; background: ${accentColor}22; border: 2px solid ${accentColor}55; display: flex; align-items: center; justify-content: center; font-size: 28px; color: ${accentColor}; margin: 0 auto 24px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
    p { color: #a1a1aa; font-size: 15px; line-height: 1.7; }
    .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272a; }
    .footer p { font-size: 13px; color: #52525b; }
    a { color: #a78bfa; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${body}</p>
    <div class="footer">
      <p>Portfolio Notifications · <a href="https://johnisah.com">johnisah.com</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ── POST / — submit contact request (public, rate-limited) ──────
router.post('/', submitLimiter, async (req, res, next) => {
  try {
    const {
      referee_id, requester_name, requester_email,
      requester_company, requester_linkedin_url,
      requester_purpose, requester_message,
    } = req.body;

    if (!referee_id || !requester_name || !requester_email) {
      return res.status(400).json({ error: 'Name, email, and referee are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requester_email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Referee must exist, be visible, and have available_on_request set
    const { rows: refRows } = await pool.query(
      'SELECT id, name, available_on_request FROM referees WHERE id = $1 AND visible = true',
      [referee_id]
    );
    if (!refRows.length) return res.status(404).json({ error: 'Referee not found' });
    if (!refRows[0].available_on_request) {
      return res.status(400).json({ error: 'Contact details are already publicly available for this referee' });
    }

    const normalEmail = requester_email.trim().toLowerCase();

    // Block duplicate active requests from same requester for same referee
    const { rows: existing } = await pool.query(
      `SELECT id FROM referee_contact_requests
       WHERE referee_id = $1 AND requester_email = $2
         AND status NOT IN ('declined','rejected','expired','fulfilled')`,
      [referee_id, normalEmail]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'You already have a pending request for this referee' });
    }

    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { rows } = await pool.query(
      `INSERT INTO referee_contact_requests
         (referee_id, requester_name, requester_email, requester_company,
          requester_linkedin_url, requester_purpose, requester_message,
          verification_token_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, verification_token`,
      [
        referee_id,
        requester_name.trim(),
        normalEmail,
        requester_company?.trim() || null,
        requester_linkedin_url?.trim() || null,
        ['recruiting','collaboration','other'].includes(requester_purpose) ? requester_purpose : 'recruiting',
        requester_message?.trim() || null,
        verificationExpires,
      ]
    );

    refereeContactRequestsTotal.inc({ status: 'submitted' });

    const verificationLink = `${apiUrl()}/api/referee-contact-requests/verify-email?token=${rows[0].verification_token}`;

    sendContactRequestSubmittedToRequester({
      name:             requester_name.trim(),
      email:            normalEmail,
      refereeName:      refRows[0].name,
      verificationLink,
    }).catch(err => console.error('[rcr] verification email failed:', err));

    res.status(201).json({ success: true, message: 'Please check your email to verify your request.' });
  } catch (err) { next(err); }
});

// ── GET /verify-email?token=xxx — verify requester email (public) ──
router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send(consentHtmlPage('Invalid Link', 'No verification token was provided.', false));
    }

    const { rows } = await pool.query(
      `UPDATE referee_contact_requests
       SET requester_email_verified = true
       WHERE verification_token = $1
         AND requester_email_verified = false
         AND verification_token_expires_at > NOW()
       RETURNING id, requester_name, requester_email, requester_company,
                 requester_purpose, requester_message, referee_id`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).send(consentHtmlPage(
        'Link Expired or Already Used',
        'This verification link has already been used or has expired. Please submit a new request.',
        false
      ));
    }

    const r = rows[0];
    const { rows: refRows } = await pool.query('SELECT name FROM referees WHERE id = $1', [r.referee_id]);
    const refereeName = refRows[0]?.name || 'the referee';

    refereeContactRequestsTotal.inc({ status: 'verified' });

    sendContactRequestNewToAdmin({
      requesterName:    r.requester_name,
      requesterEmail:   r.requester_email,
      requesterCompany: r.requester_company,
      requesterPurpose: r.requester_purpose,
      requesterMessage: r.requester_message,
      refereeName,
      adminUrl:         `${adminUrl()}/dashboard/referees`,
    }).catch(err => console.error('[rcr] admin notification failed:', err));

    res.send(consentHtmlPage(
      'Email Verified!',
      `Thank you, ${r.requester_name}. Your request has been submitted and is awaiting review. John will be in touch.`
    ));
  } catch (err) { next(err); }
});

// ── GET /consent/accept?token=xxx — referee accepts (public) ────
router.get('/consent/accept', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send(consentHtmlPage('Invalid Link', 'No consent token was provided.', false));
    }

    const { rows } = await pool.query(
      `UPDATE referee_contact_requests
       SET status = 'consent_given', consent_responded_at = NOW()
       WHERE consent_token = $1
         AND status = 'consent_requested'
         AND consent_token_expires_at > NOW()
       RETURNING id, requester_name, referee_id`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).send(consentHtmlPage(
        'Link Expired or Already Used',
        'This consent link has already been used or has expired. No further action is needed.',
        false
      ));
    }

    const { rows: refRows } = await pool.query('SELECT name FROM referees WHERE id = $1', [rows[0].referee_id]);
    const refereeName = refRows[0]?.name || '';

    refereeConsentResponsesTotal.inc({ decision: 'given' });

    sendContactRequestConsentResponseToAdmin({
      refereeName,
      requesterName: rows[0].requester_name,
      decision:      'given',
      adminUrl:      `${adminUrl()}/dashboard/referees`,
    }).catch(err => console.error('[rcr] consent response admin notification failed:', err));

    res.send(consentHtmlPage(
      'Thank You!',
      'Your consent has been recorded. John will handle the rest and let you know once the details have been shared.'
    ));
  } catch (err) { next(err); }
});

// ── GET /consent/decline?token=xxx — referee declines (public) ──
router.get('/consent/decline', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send(consentHtmlPage('Invalid Link', 'No consent token was provided.', false));
    }

    const { rows } = await pool.query(
      `UPDATE referee_contact_requests
       SET status = 'consent_denied', consent_responded_at = NOW()
       WHERE consent_token = $1
         AND status = 'consent_requested'
         AND consent_token_expires_at > NOW()
       RETURNING id, requester_name, referee_id`,
      [token]
    );

    if (!rows.length) {
      return res.status(400).send(consentHtmlPage(
        'Link Expired or Already Used',
        'This consent link has already been used or has expired. No further action is needed.',
        false
      ));
    }

    const { rows: refRows } = await pool.query('SELECT name FROM referees WHERE id = $1', [rows[0].referee_id]);
    const refereeName = refRows[0]?.name || '';

    refereeConsentResponsesTotal.inc({ decision: 'denied' });

    sendContactRequestConsentResponseToAdmin({
      refereeName,
      requesterName: rows[0].requester_name,
      decision:      'denied',
      adminUrl:      `${adminUrl()}/dashboard/referees`,
    }).catch(err => console.error('[rcr] consent response admin notification failed:', err));

    res.send(consentHtmlPage(
      'Understood',
      'Your contact details will not be shared. No further action is needed from you. Thank you for letting us know.'
    ));
  } catch (err) { next(err); }
});

// ── GET / — list all requests with referee info (admin) ─────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         rcr.id,
         rcr.referee_id,
         rcr.requester_name,
         rcr.requester_email,
         rcr.requester_email_verified,
         rcr.requester_company,
         rcr.requester_linkedin_url,
         rcr.requester_purpose,
         rcr.requester_message,
         rcr.status,
         rcr.consent_resend_count,
         rcr.consent_reminder_count,
         rcr.consent_requested_at,
         rcr.consent_responded_at,
         rcr.admin_note,
         rcr.resend_note,
         rcr.fulfilled_at,
         rcr.declined_at,
         rcr.expires_at,
         rcr.created_at,
         r.name             AS referee_name,
         r.title            AS referee_title,
         r.organization     AS referee_organization,
         (r.photo IS NOT NULL) AS referee_has_photo
       FROM referee_contact_requests rcr
       JOIN referees r ON r.id = rcr.referee_id
       ORDER BY rcr.created_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /:id/approve — admin approves (admin) ──────────────────
router.post('/:id/approve', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE referee_contact_requests
       SET status = 'approved'
       WHERE id = $1
         AND status = 'submitted'
         AND requester_email_verified = true
       RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Request not found, already actioned, or email not verified' });
    }
    refereeContactRequestsTotal.inc({ status: 'approved' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /:id/reject — admin rejects at submission stage (admin) ─
router.post('/:id/reject', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE referee_contact_requests
       SET status = 'rejected', declined_at = NOW()
       WHERE id = $1 AND status = 'submitted'
       RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found or cannot be rejected at this stage' });

    refereeContactRequestsTotal.inc({ status: 'rejected' });

    if (rows[0].requester_email_verified) {
      sendContactRequestDeclinedToRequester({
        requesterName:  rows[0].requester_name,
        requesterEmail: rows[0].requester_email,
      }).catch(err => console.error('[rcr] reject email failed:', err));
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /:id/request-consent — admin sends consent email to referee (admin) ──
router.post('/:id/request-consent', requireAuth, async (req, res, next) => {
  try {
    const { admin_note, expires_days = 14 } = req.body;

    const { rows: reqRows } = await pool.query(
      `SELECT rcr.*, r.name AS referee_name, r.email AS referee_email
       FROM referee_contact_requests rcr
       JOIN referees r ON r.id = rcr.referee_id
       WHERE rcr.id = $1 AND rcr.status = 'approved'`,
      [req.params.id]
    );
    if (!reqRows.length) {
      return res.status(404).json({ error: 'Request not found or not in approved state' });
    }

    const data = reqRows[0];
    if (!data.referee_email) {
      return res.status(400).json({ error: 'No email address on file for this referee' });
    }

    const { rows: tokenRows } = await pool.query('SELECT gen_random_uuid() AS token');
    const consentToken   = tokenRows[0].token;
    const consentExpires = new Date(Date.now() + parseInt(expires_days) * 24 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE referee_contact_requests
       SET status                  = 'consent_requested',
           consent_token           = $1,
           consent_token_expires_at = $2,
           consent_requested_at    = NOW(),
           admin_note              = COALESCE($3, admin_note),
           consent_reminder_count  = 0,
           consent_last_reminded_at = NULL
       WHERE id = $4`,
      [consentToken, consentExpires, admin_note || null, req.params.id]
    );

    refereeContactRequestsTotal.inc({ status: 'consent_requested' });

    const base        = apiUrl();
    const acceptLink  = `${base}/api/referee-contact-requests/consent/accept?token=${consentToken}`;
    const declineLink = `${base}/api/referee-contact-requests/consent/decline?token=${consentToken}`;

    await sendContactRequestConsentToReferee({
      refereeEmail:     data.referee_email,
      refereeName:      data.referee_name,
      requesterName:    data.requester_name,
      requesterEmail:   data.requester_email,
      requesterCompany: data.requester_company,
      requesterPurpose: data.requester_purpose,
      requesterMessage: data.requester_message,
      adminNote:        admin_note || null,
      acceptLink,
      declineLink,
      expiresAt:        consentExpires,
      isResend:         false,
    });

    const { rows } = await pool.query('SELECT * FROM referee_contact_requests WHERE id = $1', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /:id/resend-consent — resend after denial (admin) ──────
router.post('/:id/resend-consent', requireAuth, async (req, res, next) => {
  try {
    const { resend_note, expires_days = 14 } = req.body;
    if (!resend_note?.trim()) {
      return res.status(400).json({ error: 'A note is required when resending consent' });
    }

    const { rows: reqRows } = await pool.query(
      `SELECT rcr.*, r.name AS referee_name, r.email AS referee_email
       FROM referee_contact_requests rcr
       JOIN referees r ON r.id = rcr.referee_id
       WHERE rcr.id = $1
         AND rcr.status = 'consent_denied'
         AND rcr.consent_resend_count < 2`,
      [req.params.id]
    );
    if (!reqRows.length) {
      return res.status(404).json({ error: 'Request not found, not in consent_denied state, or maximum resends (2) already reached' });
    }

    const data = reqRows[0];
    if (!data.referee_email) {
      return res.status(400).json({ error: 'No email address on file for this referee' });
    }

    const { rows: tokenRows } = await pool.query('SELECT gen_random_uuid() AS token');
    const consentToken   = tokenRows[0].token;
    const consentExpires = new Date(Date.now() + parseInt(expires_days) * 24 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE referee_contact_requests
       SET status                   = 'consent_requested',
           consent_token            = $1,
           consent_token_expires_at  = $2,
           consent_requested_at     = NOW(),
           consent_responded_at     = NULL,
           resend_note              = $3,
           consent_resend_count     = consent_resend_count + 1,
           consent_reminder_count   = 0,
           consent_last_reminded_at  = NULL
       WHERE id = $4`,
      [consentToken, consentExpires, resend_note.trim(), req.params.id]
    );

    refereeContactRequestsTotal.inc({ status: 'consent_resent' });

    const base        = apiUrl();
    const acceptLink  = `${base}/api/referee-contact-requests/consent/accept?token=${consentToken}`;
    const declineLink = `${base}/api/referee-contact-requests/consent/decline?token=${consentToken}`;

    await sendContactRequestConsentToReferee({
      refereeEmail:     data.referee_email,
      refereeName:      data.referee_name,
      requesterName:    data.requester_name,
      requesterEmail:   data.requester_email,
      requesterCompany: data.requester_company,
      requesterPurpose: data.requester_purpose,
      requesterMessage: data.requester_message,
      adminNote:        resend_note.trim(),
      acceptLink,
      declineLink,
      expiresAt:        consentExpires,
      isResend:         true,
      resendNote:       resend_note.trim(),
    });

    const { rows } = await pool.query('SELECT * FROM referee_contact_requests WHERE id = $1', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /:id/fulfill — share contact details (admin, consent_given only) ──
router.post('/:id/fulfill', requireAuth, async (req, res, next) => {
  try {
    const { admin_note } = req.body;

    const { rows: reqRows } = await pool.query(
      `SELECT rcr.*,
              r.name  AS referee_name,
              r.email AS referee_email,
              r.phone AS referee_phone
       FROM referee_contact_requests rcr
       JOIN referees r ON r.id = rcr.referee_id
       WHERE rcr.id = $1 AND rcr.status = 'consent_given'`,
      [req.params.id]
    );
    if (!reqRows.length) {
      return res.status(404).json({ error: 'Request not found or referee consent has not been given' });
    }

    const data = reqRows[0];

    await pool.query(
      `UPDATE referee_contact_requests
       SET status = 'fulfilled', fulfilled_at = NOW(),
           admin_note = COALESCE($1, admin_note)
       WHERE id = $2`,
      [admin_note || null, req.params.id]
    );

    refereeContactRequestsTotal.inc({ status: 'fulfilled' });

    sendContactRequestFulfilledToRequester({
      requesterName:  data.requester_name,
      requesterEmail: data.requester_email,
      refereeName:    data.referee_name,
      refereeEmail:   data.referee_email,
      refereePhone:   data.referee_phone,
      adminNote:      admin_note || null,
    }).catch(err => console.error('[rcr] fulfill requester email failed:', err));

    if (data.referee_email) {
      sendContactRequestFulfilledToReferee({
        refereeEmail:    data.referee_email,
        refereeName:     data.referee_name,
        requesterName:   data.requester_name,
        requesterCompany: data.requester_company,
      }).catch(err => console.error('[rcr] fulfill referee email failed:', err));
    }

    const { rows } = await pool.query('SELECT * FROM referee_contact_requests WHERE id = $1', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── POST /:id/decline — admin declines at any stage (admin) ─────
router.post('/:id/decline', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE referee_contact_requests
       SET status = 'declined', declined_at = NOW()
       WHERE id = $1
         AND status NOT IN ('fulfilled','declined','rejected','expired')
       RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Request not found or already in a terminal state' });
    }

    refereeContactRequestsTotal.inc({ status: 'declined' });

    if (rows[0].requester_email_verified) {
      sendContactRequestDeclinedToRequester({
        requesterName:  rows[0].requester_name,
        requesterEmail: rows[0].requester_email,
      }).catch(err => console.error('[rcr] decline email failed:', err));
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── DELETE /:id — hard delete (admin) ───────────────────────────
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM referee_contact_requests WHERE id = $1',
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Request not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
