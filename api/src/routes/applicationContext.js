'use strict';
// "Application context" (Interview tab): the CV sent + the job description.
//   GET    /api/applications/:id/context
//   PUT    /api/applications/:id/context            { cv_source?, job_description? }
//   POST   /api/applications/:id/context/cv-upload  multipart "cv" (PDF ≤ 5 MB)
//   GET    /api/applications/context/cv-options     choices for the CV picker
const express = require('express');
const multer  = require('multer');
const { requireAuth } = require('../middleware/auth');
const svc = require('../services/applicationContextService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: svc.MAX_PDF_BYTES, files: 1 },
});

const idOf = req => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) throw Object.assign(new Error('Invalid application id'), { status: 400 });
  return id;
};
const fail = (res, err) => res.status(err.status || 500).json({ error: err.message });

router.get('/context/cv-options', requireAuth, async (_req, res) => {
  try { res.json(await svc.listCvOptions()); } catch (err) { fail(res, err); }
});

router.get('/:id/context', requireAuth, async (req, res) => {
  try { res.json(await svc.getApplicationContext(idOf(req))); } catch (err) { fail(res, err); }
});

router.put('/:id/context', requireAuth, async (req, res) => {
  try {
    const { cv_source, job_description } = req.body || {};
    if (cv_source !== undefined && cv_source !== null && typeof cv_source !== 'string') {
      return res.status(400).json({ error: 'cv_source must be a string or null' });
    }
    if (job_description !== undefined && typeof job_description !== 'string') {
      return res.status(400).json({ error: 'job_description must be text' });
    }
    res.json(await svc.setApplicationContext(idOf(req), { cv_source, job_description }));
  } catch (err) { fail(res, err); }
});

router.post('/:id/context/cv-upload', requireAuth, (req, res) => {
  upload.single('cv')(req, res, async err => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'PDF must be 5 MB or smaller' : err.message });
    }
    try { res.status(201).json(await svc.uploadCv(idOf(req), req.file)); } catch (e) { fail(res, e); }
  });
});

module.exports = router;
