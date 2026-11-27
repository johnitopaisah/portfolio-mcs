'use strict';
// Outbox — recruiter emails that are sent only after your approval.
//
// Public (from the approval email; the one-time token is the credential):
//   GET  /api/outbox/review/:token          confirmation page (opening it never sends)
//   POST /api/outbox/review/:token/approve  approve → sends in working hours, 5-min undo
//   POST /api/outbox/review/:token/skip
// Dashboard (login):
//   GET    /api/outbox?status=open|sent|…   list
//   GET    /api/outbox/:id                  email + full history
//   POST   /api/outbox                      { application_id, to_email?, to_name?, subject?, body?, polish? }
//   PATCH  /api/outbox/:id                  { to_email?, to_name?, subject?, body? }
//   POST   /api/outbox/:id/approve | /skip | /undo | /polish
//   POST   /api/outbox/:id/language          { language: 'en'|'fr' } — translates the current text
//   GET    /api/outbox/possible-rejections   unconfirmed rejection emails
//   POST   /api/outbox/possible-rejections/:emailId/confirm | /dismiss   { application_id }
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../services/rateLimit');
const { createOutbox, esc } = require('../services/outboxService');

const router = express.Router();
const outbox = createOutbox();
const fail = (res, err) => res.status(err.status || 500).json({ error: err.message });
const idOf = req => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('Invalid id'), { status: 400 });
  return id;
};

// ── public review page ───────────────────────────────────────────
const reviewLimiter = createRateLimiter('outbox-review', { windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });

const adminUrl = () => (process.env.ADMIN_URL || 'https://admin.johnisah.com').replace(/\/$/, '');

function page(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer"><title>${esc(title)}</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;
       background:linear-gradient(160deg,#160a2b,#2a1150);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#f4f4f5}
  main{width:100%;max-width:640px;background:#1c0f33;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.5)}
  h1{font-size:20px;margin:0 0 6px} p.lead{color:#c4b5fd;margin:0 0 18px;font-size:14px}
  .meta{font-size:14px;color:#a1a1aa;margin:2px 0} .meta b{color:#e4e4e7}
  .body{white-space:pre-wrap;background:#0f0720;border-radius:10px;padding:16px;margin:14px 0 20px;font-size:15px;line-height:1.55;color:#ede9fe;overflow-wrap:anywhere}
  .row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
  button{font:inherit;font-size:15px;font-weight:600;border-radius:10px;padding:10px 18px;cursor:pointer;border:1px solid transparent}
  .send{background:#7c3aed;color:#fff} .send:hover{background:#6d28d9}
  .skip{background:transparent;color:#e4e4e7;border-color:rgba(255,255,255,.2)} .skip:hover{background:rgba(255,255,255,.06)}
  a{color:#c4b5fd} .note{color:#8b8b98;font-size:12px;margin-top:18px}
  button:focus-visible,a:focus-visible{outline:2px solid #c4b5fd;outline-offset:2px}
</style></head><body><main>${inner}</main></body></html>`;
}

const LINK_ERRORS = {
  invalid: ['This link is not valid', 'It may have been copied incompletely, or the email has already been handled.'],
  expired: ['This link has expired', 'Approval links last 72 hours. Open the Outbox in your dashboard to review and send it.'],
  edited:  ['This email was edited', 'The link was for an earlier version. Review the latest version in your dashboard.'],
  used:    ['Already handled', 'This email has already been approved, skipped or sent.'],
};
function linkError(res, code, email) {
  const [title, msg] = LINK_ERRORS[code] || LINK_ERRORS.invalid;
  const dash = email ? `${adminUrl()}/outbox?id=${email.id}` : `${adminUrl()}/outbox`;
  res.status(code === 'invalid' ? 404 : 410).type('html').send(page(title,
    `<h1>${esc(title)}</h1><p class="lead">${esc(msg)}</p><p><a href="${esc(dash)}">Open the Outbox</a></p>`));
}

router.get('/review/:token', reviewLimiter, async (req, res) => {
  try {
    const { email, error } = await outbox.findByToken(req.params.token);
    if (error) return linkError(res, error, email);
    const action = `/api/outbox/review/${encodeURIComponent(req.params.token)}`;
    res.set('Cache-Control', 'no-store').type('html').send(page('Review email before sending', `
      <h1>Send this email?</h1>
      <p class="lead">Nothing has been sent yet. Check it, then choose.</p>
      <p class="meta"><b>To:</b> ${esc(email.to_name ? `${email.to_name} <${email.to_email}>` : email.to_email)}</p>
      <p class="meta"><b>Subject:</b> ${esc(email.subject)}</p>
      <div class="body">${esc(email.body)}</div>
      <div class="row">
        <form method="post" action="${esc(action)}/approve"><button class="send" type="submit">Send</button></form>
        <form method="post" action="${esc(action)}/skip"><button class="skip" type="submit">Don't send</button></form>
        <a href="${esc(`${adminUrl()}/outbox?id=${email.id}`)}">Edit in dashboard</a>
      </div>
      <p class="note">Sends during working hours (Mon–Fri 09:00–18:00 Paris), with 5 minutes to undo from the Outbox.</p>`));
  } catch (err) {
    res.status(500).type('html').send(page('Something went wrong', '<h1>Something went wrong</h1><p class="lead">Please try again in a moment.</p>'));
  }
});

async function reviewAction(req, res, act) {
  try {
    const { email, error } = await outbox.findByToken(req.params.token);
    if (error) return linkError(res, error, email);
    const meta = { ip: req.ip, user_agent: String(req.get('user-agent') || '').slice(0, 200) };
    const done = act === 'approve'
      ? await outbox.approve(email.id, { via: 'email', meta })
      : await outbox.skip(email.id, { via: 'email', meta });
    const when = done.send_after ? new Date(done.send_after).toLocaleString('en-GB', {
      timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit',
    }) : null;
    const paused = act === 'approve' && await require('../services/availability').isSearchPaused();
    res.set('Cache-Control', 'no-store').type('html').send(page(act === 'approve' ? 'Approved' : 'Not sent', act === 'approve'
      ? `<h1>Approved ✓</h1><p class="lead">${paused
          ? `Your job search is paused (availability: Not open). It will be sent to ${esc(email.to_email)} after you switch back to Available or Open to right.`
          : `It will be sent to ${esc(email.to_email)} ${when ? `on ${esc(when)} (Paris time)` : 'shortly'}.`}</p>
         <p>Changed your mind? <a href="${esc(`${adminUrl()}/outbox?id=${email.id}`)}">Undo in the Outbox</a> within 5 minutes.</p>`
      : `<h1>Not sent</h1><p class="lead">This email was skipped and won't be sent.</p>`));
  } catch (err) {
    res.status(err.status === 409 ? 409 : 500).type('html').send(page('Could not complete',
      `<h1>Couldn't complete that</h1><p class="lead">${esc(err.status ? err.message : 'Please try again in a moment.')}</p>`));
  }
}
router.post('/review/:token/approve', reviewLimiter, (req, res) => reviewAction(req, res, 'approve'));
router.post('/review/:token/skip',    reviewLimiter, (req, res) => reviewAction(req, res, 'skip'));

// ── dashboard ────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try { res.json(await outbox.list({ status: req.query.status })); } catch (err) { fail(res, err); }
});

// Rejection emails that could not be attached with certainty: "Was this a rejection?"
router.get('/possible-rejections', requireAuth, async (_req, res) => {
  try { res.json(await outbox.possibleRejections()); } catch (err) { fail(res, err); }
});
const applicationClose = require('../services/applicationClose').createApplicationClose();
router.post('/possible-rejections/:emailId/confirm', requireAuth, async (req, res) => {
  try {
    const emailId = Number.parseInt(req.params.emailId, 10);
    const appId = Number.parseInt(req.body?.application_id, 10);
    if (!Number.isInteger(emailId) || !Number.isInteger(appId)) return res.status(400).json({ error: 'email and application_id are required' });
    res.json(await applicationClose.close(appId, 'REJECTED', { via: 'rejection_email', emailResponseId: emailId }));
  } catch (err) { fail(res, err); }
});
router.post('/possible-rejections/:emailId/dismiss', requireAuth, async (req, res) => {
  try {
    const emailId = Number.parseInt(req.params.emailId, 10);
    const appId = Number.parseInt(req.body?.application_id, 10);
    if (!Number.isInteger(emailId) || !Number.isInteger(appId)) return res.status(400).json({ error: 'email and application_id are required' });
    res.json(await outbox.dismissRejection(emailId, appId));
  } catch (err) { fail(res, err); }
});

router.post('/:id/language', requireAuth, async (req, res) => {
  try {
    const id = idOf(req);
    await outbox.setLanguage(id, req.body?.language);
    res.json(await outbox.detail(id));
  } catch (err) { fail(res, err); }
});

router.get('/:id', requireAuth, async (req, res) => {
  try { res.json(await outbox.detail(idOf(req))); } catch (err) { fail(res, err); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const appId = Number.parseInt(req.body?.application_id, 10);
    if (!Number.isInteger(appId) || appId < 1) return res.status(400).json({ error: 'application_id is required' });
    const { to_email, to_name, subject, body, polish, language } = req.body;
    const draft = await outbox.createManualDraft(appId, { to_email, to_name, subject, body, polish, language });
    res.status(201).json(await outbox.detail(draft.id));
  } catch (err) { fail(res, err); }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { to_email, to_name, subject, body } = req.body || {};
    await outbox.update(idOf(req), { to_email, to_name, subject, body });
    res.json(await outbox.detail(idOf(req)));
  } catch (err) { fail(res, err); }
});

for (const action of ['approve', 'skip', 'undo', 'polish']) {
  router.post(`/:id/${action}`, requireAuth, async (req, res) => {
    try {
      const id = idOf(req);
      if (action === 'approve') await outbox.approve(id, { via: 'dashboard' });
      if (action === 'skip')    await outbox.skip(id, { via: 'dashboard' });
      if (action === 'undo')    await outbox.undo(id);
      if (action === 'polish')  await outbox.polishExisting(id);
      res.json(await outbox.detail(id));
    } catch (err) { fail(res, err); }
  });
}

module.exports = router;
