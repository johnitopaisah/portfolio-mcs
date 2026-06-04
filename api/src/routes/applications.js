'use strict';

const express         = require('express');
const pool            = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = new Set([
  'DRAFT', 'CV_GENERATED', 'READY_TO_APPLY', 'APPLIED',
  'EMAIL_RECEIVED', 'HR_CONTACTED', 'INTERVIEW_INVITE',
  'TECHNICAL_TEST', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW',
  'OFFER', 'REJECTED', 'NO_RESPONSE', 'ARCHIVED',
]);

/**
 * @swagger
 * /api/applications/cv-library:
 *   get:
 *     summary: Browse the CV document library
 *     description: >
 *       Returns all generated CV/cover-letter documents across all applications,
 *       newest first. Optionally filtered by `document_type`.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [cv, cover_letter] }
 *         description: Filter by document type
 *     responses:
 *       200:
 *         description: Array of document records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/ApplicationDocument' }
 *       401:
 *         description: Unauthorised
 */
router.get('/cv-library', requireAuth, async (req, res) => {
  try {
    const { type } = req.query;
    let query = `
      SELECT
        ad.id, ad.application_id, ad.document_type, ad.content_json,
        ad.source_html, ad.version, ad.base_cv_version,
        ad.ai_model, ad.prompt_version, ad.generated_by_ai, ad.created_at,
        a.company_name,
        a.job_title,
        bcv.version AS base_cv_version_num,
        bcv.name    AS base_cv_name
      FROM application_documents ad
      JOIN applications a ON ad.application_id = a.id
      LEFT JOIN base_cv_versions bcv ON ad.base_cv_version = bcv.id
    `;
    const params = [];
    if (type) {
      query += ' WHERE ad.document_type = $1';
      params.push(type);
    }
    query += ' ORDER BY ad.created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications/email-responses:
 *   get:
 *     summary: List tracked email responses
 *     description: >
 *       Returns paginated email responses classified by the AI worker.
 *       Optionally filtered by `application_id` to show emails linked to a
 *       specific application.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: application_id
 *         schema: { type: integer }
 *         description: Filter to emails linked to a specific application
 *     responses:
 *       200:
 *         description: Paginated email responses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 emails:
 *                   type: array
 *                   items: { type: object }
 *                 total: { type: integer }
 *                 page:  { type: integer }
 *                 limit: { type: integer }
 *       401:
 *         description: Unauthorised
 */
router.get('/email-responses', requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50, application_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params     = [];

    if (application_id) {
      params.push(parseInt(application_id));
      conditions.push(`er.application_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(parseInt(limit), offset);
    const result = await pool.query(
      `SELECT er.*, a.company_name, a.job_title
       FROM email_responses er
       LEFT JOIN applications a ON er.application_id = a.id
       ${where}
       ORDER BY er.received_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = application_id ? [parseInt(application_id)] : [];
    const countWhere  = application_id ? 'WHERE application_id = $1' : '';
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM email_responses ${countWhere}`,
      countParams
    );

    res.json({
      emails: result.rows,
      total:  parseInt(countRes.rows[0].count),
      page:   parseInt(page),
      limit:  parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications/email-responses/{id}/link:
 *   patch:
 *     summary: Link an email response to an application
 *     description: Associates an email response record with a specific application by ID.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [application_id]
 *             properties:
 *               application_id: { type: integer }
 *     responses:
 *       200:
 *         description: Updated email response
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.patch('/email-responses/:id/link', requireAuth, async (req, res) => {
  try {
    const { application_id } = req.body;
    if (!application_id) return res.status(400).json({ error: 'application_id required' });
    const result = await pool.query(
      'UPDATE email_responses SET application_id = $1 WHERE id = $2 RETURNING *',
      [application_id, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications/email-responses/{id}/reclassify:
 *   patch:
 *     summary: Override AI classification of an email response
 *     description: Manually sets the `ai_classification` field on an email response record.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classification]
 *             properties:
 *               classification:
 *                 type: string
 *                 enum: [INTERVIEW_INVITE, REJECTION, TECHNICAL_TEST, OFFER, FOLLOW_UP_NEEDED, GENERAL_RESPONSE, UNKNOWN]
 *     responses:
 *       200:
 *         description: Updated email response
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorised
 */
router.patch('/email-responses/:id/reclassify', requireAuth, async (req, res) => {
  try {
    const { classification } = req.body;
    const valid = ['INTERVIEW_INVITE', 'REJECTION', 'TECHNICAL_TEST', 'OFFER', 'FOLLOW_UP_NEEDED', 'GENERAL_RESPONSE', 'UNKNOWN'];
    if (!valid.includes(classification)) return res.status(400).json({ error: 'Invalid classification' });
    const result = await pool.query(
      'UPDATE email_responses SET ai_classification = $1 WHERE id = $2 RETURNING *',
      [classification, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications:
 *   get:
 *     summary: List job applications
 *     description: Returns all applications ordered by creation date. Supports filtering by status, platform, needs_action flag, and free-text search.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, CV_GENERATED, READY_TO_APPLY, APPLIED, EMAIL_RECEIVED, HR_CONTACTED, INTERVIEW_INVITE, TECHNICAL_TEST, INTERVIEW_SCHEDULED, FINAL_INTERVIEW, OFFER, REJECTED, NO_RESPONSE, ARCHIVED]
 *       - in: query
 *         name: platform
 *         schema: { type: string }
 *         description: Source platform filter (e.g. LinkedIn, joobleApi)
 *       - in: query
 *         name: needs_action
 *         schema: { type: string, enum: ['true'] }
 *         description: Set to "true" to show only applications needing action
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Partial match on company name or job title
 *     responses:
 *       200:
 *         description: Array of application records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Application' }
 *       401:
 *         description: Unauthorised
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, platform, needs_action, search } = req.query;

    let query = `
      SELECT a.*, j.title AS job_title_ref
      FROM applications a
      LEFT JOIN jobs j ON a.job_id = j.id
    `;
    const conditions = [];
    const params     = [];

    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (platform) {
      params.push(platform);
      conditions.push(`a.source_platform = $${params.length}`);
    }
    if (needs_action === 'true') {
      conditions.push(`a.status IN ('EMAIL_RECEIVED', 'INTERVIEW_INVITE', 'TECHNICAL_TEST', 'OFFER')`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(a.company_name ILIKE $${params.length} OR a.job_title ILIKE $${params.length})`);
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY a.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications:
 *   post:
 *     summary: Create an application from a pipeline job
 *     description: >
 *       Creates a new application in `DRAFT` status from a job in the pipeline.
 *       Copies job metadata (title, company, apply URL, source, match score)
 *       and logs an `APPLICATION_CREATED` event.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [job_id]
 *             properties:
 *               job_id: { type: string, format: uuid }
 *     responses:
 *       201:
 *         description: Application created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Application' }
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) return res.status(400).json({ error: 'job_id is required' });

    const jobRes = await pool.query(
      'SELECT id, title, company_name, apply_url, source_api, relevance_score FROM jobs WHERE id = $1',
      [job_id]
    );
    if (!jobRes.rows.length) return res.status(404).json({ error: 'Job not found' });

    const job = jobRes.rows[0];

    const appRes = await pool.query(
      `INSERT INTO applications (job_id, company_name, job_title, job_url, source_platform, match_score, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
       RETURNING *`,
      [job.id, job.company_name, job.title, job.apply_url, job.source_api, job.relevance_score]
    );
    const application = appRes.rows[0];

    await pool.query(
      `INSERT INTO application_events (application_id, event_type, description)
       VALUES ($1, 'APPLICATION_CREATED', 'Application created from job listing')`,
      [application.id]
    );

    res.status(201).json(application);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications/{id}:
 *   get:
 *     summary: Get a single application with full detail
 *     description: Returns the application record together with its event timeline and all generated documents.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Application detail
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Application'
 *                 - type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       items: { type: object }
 *                     documents:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ApplicationDocument' }
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const [appRes, eventsRes, docsRes] = await Promise.all([
      pool.query('SELECT * FROM applications WHERE id = $1', [id]),
      pool.query(
        'SELECT * FROM application_events WHERE application_id = $1 ORDER BY event_date ASC',
        [id]
      ),
      pool.query(
        'SELECT id, application_id, document_type, content_json, source_html, version, base_cv_version, ai_model, prompt_version, generated_by_ai, created_at FROM application_documents WHERE application_id = $1 ORDER BY created_at DESC',
        [id]
      ),
    ]);

    if (!appRes.rows.length) return res.status(404).json({ error: 'Application not found' });

    res.json({
      ...appRes.rows[0],
      events:    eventsRes.rows,
      documents: docsRes.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications/{id}/status:
 *   patch:
 *     summary: Update application status
 *     description: >
 *       Advances the application through the CRM pipeline. Setting status to
 *       `APPLIED` automatically stamps `applied_at`. Each status change is
 *       logged as an `application_events` row.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [DRAFT, CV_GENERATED, READY_TO_APPLY, APPLIED, EMAIL_RECEIVED, HR_CONTACTED, INTERVIEW_INVITE, TECHNICAL_TEST, INTERVIEW_SCHEDULED, FINAL_INTERVIEW, OFFER, REJECTED, NO_RESPONSE, ARCHIVED]
 *               description:
 *                 type: string
 *                 description: Optional note logged with the status change event
 *     responses:
 *       200:
 *         description: Updated application
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Application' }
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { id }                      = req.params;
    const { status, description = '' } = req.body;

    if (!status || !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: `Invalid status. Valid values: ${[...VALID_STATUSES].join(', ')}` });
    }

    let updateQuery = 'UPDATE applications SET status = $1, updated_at = NOW()';
    const params    = [status, id];

    if (status === 'APPLIED') {
      updateQuery += ', applied_at = NOW()';
    }

    updateQuery += ' WHERE id = $2 RETURNING *';
    const appRes = await pool.query(updateQuery, params);
    if (!appRes.rows.length) return res.status(404).json({ error: 'Application not found' });

    await pool.query(
      `INSERT INTO application_events (application_id, event_type, description)
       VALUES ($1, 'STATUS_CHANGED', $2)`,
      [id, description || `Status updated to ${status}`]
    );

    res.json(appRes.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications/{id}/notes:
 *   post:
 *     summary: Add a note to an application
 *     description: Saves a free-text note against the application and logs a `NOTE_ADDED` event.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [note]
 *             properties:
 *               note: { type: string, maxLength: 500 }
 *     responses:
 *       201:
 *         description: Note event created
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorised
 */
router.post('/:id/notes', requireAuth, async (req, res) => {
  try {
    const { id }   = req.params;
    const { note } = req.body;

    if (!note || !note.trim()) return res.status(400).json({ error: 'note is required' });

    await pool.query(
      'UPDATE applications SET notes = $1, updated_at = NOW() WHERE id = $2',
      [note, id]
    );

    const eventRes = await pool.query(
      `INSERT INTO application_events (application_id, event_type, description)
       VALUES ($1, 'NOTE_ADDED', $2)
       RETURNING *`,
      [id, note.slice(0, 500)]
    );

    res.status(201).json(eventRes.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications/{id}/generate-cv:
 *   post:
 *     summary: Generate a tailored CV document
 *     description: >
 *       Triggers AI-assisted CV generation for the application. The resulting
 *       document is stored in `application_documents` and can be downloaded via
 *       `GET /api/applications/{id}/documents/{docId}/download`.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               force:    { type: boolean, default: false, description: Regenerate even if a document already exists }
 *               language: { type: string, enum: [en, fr], default: en }
 *     responses:
 *       200:
 *         description: Generated document record
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ApplicationDocument' }
 *       401:
 *         description: Unauthorised
 */
router.post('/:id/generate-cv', requireAuth, async (req, res) => {
  try {
    const { force = false, language = 'en' } = req.body;
    const { generateCv } = require('../workers/cvWorker');
    const document = await generateCv(parseInt(req.params.id), { force, language });
    res.json(document);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications/{id}/documents:
 *   get:
 *     summary: List documents for an application
 *     description: Returns all generated CV and cover-letter documents for the application, newest first.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Array of document records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/ApplicationDocument' }
 *       401:
 *         description: Unauthorised
 */
router.get('/:id/documents', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM application_documents WHERE application_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications/{id}/documents/{docId}/download:
 *   get:
 *     summary: Download a generated CV/cover-letter PDF
 *     description: >
 *       Streams the PDF binary directly from the `file_data` BYTEA column.
 *       The `Content-Disposition` header is set to `attachment` with a
 *       descriptive filename.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: Application ID
 *       - in: path
 *         name: docId
 *         required: true
 *         schema: { type: integer }
 *         description: Document ID
 *     responses:
 *       200:
 *         description: PDF binary
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/:id/documents/:docId/download', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT file_data, document_type, version FROM application_documents WHERE id = $1 AND application_id = $2',
      [req.params.docId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    const { file_data, document_type, version } = result.rows[0];
    if (!file_data) return res.status(404).json({ error: 'PDF not yet generated for this document' });
    const filename = `${document_type}-v${version}-app${req.params.id}.pdf`;
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(file_data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/applications/{id}:
 *   delete:
 *     summary: Archive an application
 *     description: >
 *       Soft-deletes the application by setting its status to `ARCHIVED` and
 *       logging an `APPLICATION_ARCHIVED` event. The record is retained in the
 *       database.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Application archived
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 archived: { type: boolean, example: true }
 *       401:
 *         description: Unauthorised
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `UPDATE applications SET status = 'ARCHIVED', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    await pool.query(
      `INSERT INTO application_events (application_id, event_type, description)
       VALUES ($1, 'STATUS_CHANGED', 'Application archived')`,
      [id]
    );

    res.json({ archived: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
