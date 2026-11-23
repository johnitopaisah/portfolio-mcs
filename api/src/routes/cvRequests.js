'use strict';
// CV requests — the CV is emailed to the visitor instead of downloaded.
//   POST   /api/cv-requests            public  { email, language, name?, company?, role?, consent, source?, website? }
//   GET    /api/cv-requests            admin   ?range=7d|30d|90d|365d|all&language=&country=
//   GET    /api/cv-requests/stats      admin   ?range=
//   PATCH  /api/cv-requests/:id        admin   { contacted?, notes? }
//   DELETE /api/cv-requests/:id        admin   deletes every request from that email (GDPR)
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { clientIp } = require('../services/parseVisitor');
const { createCvRequests } = require('../services/cvRequestService');

const router = express.Router();
const cv = createCvRequests();
const fail = (res, err) => res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong' });
const idOf = req => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('Invalid id'), { status: 400 });
  return id;
};

router.post('/', async (req, res) => {
  try {
    const out = await cv.request(req.body || {}, {
      ip: clientIp(req),
      userAgent: req.get('user-agent'),
      referrer: req.get('x-referer') || req.get('referer'),
      countryCode: req.get('cf-ipcountry'),
    });
    res.status(out.status === 'sent' ? 201 : 200).json(out);
  } catch (err) {
    if (!err.status) console.error('[CvRequest]', err);
    fail(res, err);
  }
});

router.get('/', requireAuth, async (req, res) => {
  try { res.json(await cv.list({ range: req.query.range, language: req.query.language, country: req.query.country })); }
  catch (err) { fail(res, err); }
});

router.get('/stats', requireAuth, async (req, res) => {
  try { res.json(await cv.stats({ range: req.query.range })); } catch (err) { fail(res, err); }
});

router.patch('/:id', requireAuth, async (req, res) => {
  try { res.json(await cv.update(idOf(req), req.body || {})); } catch (err) { fail(res, err); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try { res.json(await cv.remove(idOf(req))); } catch (err) { fail(res, err); }
});

module.exports = router;
