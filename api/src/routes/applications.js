'use strict';

const express              = require('express');
const pool                 = require('../db/client');
const { requireAuth }      = require('../middleware/auth');
const emailSyncLogService  = require('../services/emailTracking/emailSyncLogService');
const { renderHtmlToPdf }  = require('../services/cvGeneration/pdfService');
const { sanitizeEditedHtml, checkAtsRisks } = require('../services/cvGeneration/manualEditService');

const router = express.Router();

const VALID_STATUSES = new Set([
  'DRAFT', 'CV_GENERATED', 'READY_TO_APPLY', 'APPLIED',
  'EMAIL_RECEIVED', 'HR_CONTACTED', 'INTERVIEW_INVITE',
  'TECHNICAL_TEST', 'INTERVIEW_SCHEDULED', 'FINAL_INTERVIEW',
  'OFFER', 'NEGOTIATING', 'ACCEPTED', 'DECLINED_OFFER',
  'REJECTED', 'NO_RESPONSE', 'WITHDRAWN', 'GHOSTED', 'ARCHIVED',
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
    const {
      page = 1, limit = 50, application_id,
      source_account, classification, matched,
      confidence_min, confidence_max,
      search, date_from, date_to, domain,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params     = [];

    if (application_id) {
      params.push(parseInt(application_id));
      conditions.push(`er.application_id = $${params.length}`);
    }
    if (source_account) {
      params.push(source_account);
      conditions.push(`er.source_account = $${params.length}`);
    }
    if (classification) {
      const list = String(classification).split(',').filter(Boolean);
      if (list.length) {
        params.push(list);
        conditions.push(`er.ai_classification = ANY($${params.length})`);
      }
    }
    if (matched === 'true')  conditions.push('er.application_id IS NOT NULL');
    if (matched === 'false') conditions.push('er.application_id IS NULL');
    if (confidence_min !== undefined) {
      params.push(parseFloat(confidence_min));
      conditions.push(`er.confidence_score >= $${params.length}`);
    }
    if (confidence_max !== undefined) {
      params.push(parseFloat(confidence_max));
      conditions.push(`er.confidence_score <= $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(er.subject ILIKE $${params.length} OR er.sender_email ILIKE $${params.length} OR er.body_snippet ILIKE $${params.length})`);
    }
    if (date_from) {
      params.push(date_from);
      conditions.push(`er.received_at >= $${params.length}`);
    }
    if (date_to) {
      params.push(date_to);
      conditions.push(`er.received_at <= $${params.length}`);
    }
    if (domain) {
      params.push(`%@${domain}`);
      conditions.push(`er.sender_email ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const listParams = [...params, parseInt(limit), offset];
    const result = await pool.query(
      `SELECT er.*, a.company_name, a.job_title
       FROM email_responses er
       LEFT JOIN applications a ON er.application_id = a.id
       ${where}
       ORDER BY er.received_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM email_responses er ${where}`,
      params
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

// GET /api/applications/email-sync-status
// Latest sync result per mailbox — powers the dashboard health badge.
router.get('/email-sync-status', requireAuth, async (req, res) => {
  try {
    const rows = await emailSyncLogService.getLatestStatusBySource();
    res.json({ sources: rows });
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
      `UPDATE email_responses
       SET ai_classification = $1, reviewed_correct = FALSE, corrected_classification = $1
       WHERE id = $2 RETURNING *`,
      [classification, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/applications/email-responses/:id/feedback
// Thumbs-up/down on whether the AI's classification was correct, without
// changing it — distinct from /reclassify, which corrects the value itself.
router.patch('/email-responses/:id/feedback', requireAuth, async (req, res) => {
  try {
    const { correct } = req.body;
    if (typeof correct !== 'boolean') return res.status(400).json({ error: 'correct must be true or false' });
    const result = await pool.query(
      'UPDATE email_responses SET reviewed_correct = $1 WHERE id = $2 RETURNING *',
      [correct, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
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
router.get('/cv-templates', requireAuth, (req, res) => {
  const { CV_TEMPLATES, COVER_LETTER_TEMPLATES, SECTION_PRESETS, suggestPreset } = require('../services/cvGeneration/templateService');
  const { jd } = req.query;
  res.json({
    cv_templates:            CV_TEMPLATES,
    cover_letter_templates:  COVER_LETTER_TEMPLATES,
    section_presets:         SECTION_PRESETS,
    suggested_preset:        jd ? suggestPreset(jd) : null,
  });
});

// ── Profile sections availability ─────────────────────────────
router.get('/profile-sections-status', requireAuth, async (req, res) => {
  try {
    const [expRes, skillsRes, certRes, eduRes, projRes, refsRes, profileRes] = await Promise.all([
      pool.query('SELECT COUNT(*) AS count FROM experiences'),
      pool.query('SELECT COUNT(*) AS count FROM skills'),
      pool.query('SELECT COUNT(*) AS count FROM certifications'),
      pool.query('SELECT COUNT(*) AS count FROM education'),
      pool.query("SELECT COUNT(*) AS count FROM projects WHERE published = TRUE"),
      pool.query('SELECT COUNT(*) AS count FROM referees WHERE visible = TRUE'),
      pool.query('SELECT name FROM profile LIMIT 1'),
    ]);
    res.json({
      summary:        profileRes.rows.length > 0,
      skills:         parseInt(skillsRes.rows[0].count) > 0,
      experience:     parseInt(expRes.rows[0].count) > 0,
      education:      parseInt(eduRes.rows[0].count) > 0,
      certifications: parseInt(certRes.rows[0].count) > 0,
      projects:       parseInt(projRes.rows[0].count) > 0,
      references:     parseInt(refsRes.rows[0].count) > 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const [appRes, eventsRes, docsRes, contactsRes, remindersRes] = await Promise.all([
      pool.query('SELECT * FROM applications WHERE id = $1', [id]),
      pool.query(
        'SELECT * FROM application_events WHERE application_id = $1 ORDER BY event_date DESC',
        [id]
      ),
      pool.query(
        `SELECT id, application_id, document_type, version, base_cv_version, ai_model, generated_by_ai,
                template_id, color_scheme, accent_color, sections_included, generation_hints, generation_config,
                created_at, is_manually_edited, edited_at
         FROM application_documents WHERE application_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
      pool.query(
        'SELECT * FROM application_contacts WHERE application_id = $1 ORDER BY created_at ASC',
        [id]
      ),
      pool.query(
        'SELECT * FROM application_reminders WHERE application_id = $1 ORDER BY remind_at ASC',
        [id]
      ),
    ]);

    if (!appRes.rows.length) return res.status(404).json({ error: 'Application not found' });

    res.json({
      ...appRes.rows[0],
      events:    eventsRes.rows,
      documents: docsRes.rows,
      contacts:  contactsRes.rows,
      reminders: remindersRes.rows,
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

    if (status === 'APPLIED') updateQuery += ', applied_at = NOW()';
    if (['OFFER', 'NEGOTIATING', 'ACCEPTED', 'DECLINED_OFFER', 'REJECTED', 'NO_RESPONSE', 'GHOSTED'].includes(status)) {
      updateQuery += ', last_response_at = NOW()';
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
    const {
      force       = false,
      language    = 'en',
      sections    = ['summary', 'skills', 'experience', 'education', 'certifications'],
      userHints   = '',
      hintChips   = [],
      intensity   = 'balanced',
      templateId  = 'classic',
      colorScheme = 'colored',
      accentColor = '#2563EB',
      fontFamily  = 'inter',
      fontSize    = '10.5pt',
      lineDensity = 'normal',
    } = req.body;

    const { generateCv } = require('../workers/cvWorker');
    const document = await generateCv(parseInt(req.params.id), {
      force, language, sections, userHints, hintChips,
      intensity, templateId, colorScheme, accentColor,
      fontFamily, fontSize, lineDensity,
    });
    res.json(document);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/generate-cover-letter', requireAuth, async (req, res) => {
  try {
    const {
      language           = 'en',
      tone               = 'professional',
      length             = 'standard',
      format             = 'modern',
      userHints          = '',
      accentColor        = '#2563EB',
      colorScheme        = 'colored',
      linkedCvDocumentId = null,
    } = req.body;

    const coverLetterService = require('../services/cvGeneration/coverLetterService');
    const result = await coverLetterService.generate(parseInt(req.params.id), {
      language, tone, length, format, userHints,
      accentColor, colorScheme, linkedCvDocumentId,
    });
    res.json(result.document);
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
// ── Document: preview (serves source_html as HTML page) ──────
router.get('/:id/documents/:docId/preview', requireAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const result = await pool.query(
      'SELECT source_html FROM application_documents WHERE id = $1 AND application_id = $2',
      [docId, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    const html = result.rows[0].source_html;
    if (!html) return res.status(404).json({ error: 'No preview available — document has no source HTML' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Document: delete ──────────────────────────────────────────
router.delete('/:id/documents/:docId', requireAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const result = await pool.query(
      'DELETE FROM application_documents WHERE id = $1 AND application_id = $2 RETURNING id, document_type, version',
      [docId, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];
    await pool.query(
      `INSERT INTO application_events (application_id, event_type, description)
       VALUES ($1, 'STATUS_CHANGED', $2)`,
      [id, `${doc.document_type} v${doc.version} deleted`]
    );
    res.json({ deleted: true, id: Number(docId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Document: manual edit — explicit save (sanitize, re-print PDF,
//    freeze from further AI/cosmetic regeneration) ────────────
router.patch('/:id/documents/:docId/content', requireAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { html } = req.body;
    if (typeof html !== 'string' || !html.trim()) {
      return res.status(400).json({ error: 'html is required' });
    }

    const exists = await pool.query(
      'SELECT id FROM application_documents WHERE id = $1 AND application_id = $2',
      [docId, id]
    );
    if (!exists.rows.length) return res.status(404).json({ error: 'Document not found' });

    const appRes = await pool.query('SELECT matched_skills FROM applications WHERE id = $1', [id]);
    const matchedSkills = appRes.rows[0]?.matched_skills || [];

    const safeHtml = sanitizeEditedHtml(html);
    const warnings = checkAtsRisks(safeHtml, matchedSkills);
    const pdfBuffer = await renderHtmlToPdf(safeHtml);

    const result = await pool.query(
      `UPDATE application_documents
       SET source_html = $1, file_data = $2, is_manually_edited = TRUE, edited_at = NOW()
       WHERE id = $3 RETURNING id, document_type, version, is_manually_edited, edited_at`,
      [safeHtml, pdfBuffer, docId]
    );

    await pool.query(
      `INSERT INTO application_events (application_id, event_type, description)
       VALUES ($1, 'STATUS_CHANGED', $2)`,
      [id, `${result.rows[0].document_type} v${result.rows[0].version} manually edited`]
    );

    res.json({ ...result.rows[0], warnings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Document: manual edit — autosave (lightweight, no PDF re-print) ──
router.patch('/:id/documents/:docId/autosave', requireAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { html } = req.body;
    if (typeof html !== 'string') return res.status(400).json({ error: 'html is required' });

    const safeHtml = sanitizeEditedHtml(html);
    const result = await pool.query(
      `UPDATE application_documents
       SET source_html = $1, last_autosaved_at = NOW()
       WHERE id = $2 AND application_id = $3 RETURNING id, last_autosaved_at`,
      [safeHtml, docId, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Document: AI-shorten one or more text blocks (whole-document
//    "Shrink to fit" or single-paragraph "Shorten this") ───────
// Stateless — does not touch the DB. The frontend applies the
// shortened text into the editor and the user still explicitly
// Saves/autosaves afterward, same as any other manual edit.
router.post('/:id/documents/:docId/shrink-text', requireAuth, async (req, res) => {
  try {
    const { blocks, intensity = 'light' } = req.body;
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return res.status(400).json({ error: 'blocks (non-empty array) is required' });
    }
    if (!['light', 'aggressive'].includes(intensity)) {
      return res.status(400).json({ error: 'intensity must be "light" or "aggressive"' });
    }
    const documentShrinkService = require('../services/cvGeneration/documentShrinkService');
    const result = await documentShrinkService.shrinkBlocks(blocks, intensity);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Document: AI-original HTML for "compare to AI version" ─────
router.get('/:id/documents/:docId/ai-original', requireAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const docRes = await pool.query(
      'SELECT content_json, sections_included, template_id, color_scheme, accent_color, document_type FROM application_documents WHERE id = $1 AND application_id = $2',
      [docId, id]
    );
    if (!docRes.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = docRes.rows[0];
    if (doc.document_type !== 'CV') {
      return res.status(400).json({ error: 'Compare-to-AI view is only available for CVs' });
    }

    const baseCvService = require('../services/cvGeneration/baseCvService');
    const { buildCvHtml } = require('../services/cvGeneration/pdfService');
    const activeBaseCv = await baseCvService.getActiveBaseCv();

    const html = buildCvHtml({
      aiOutput:    doc.content_json || {},
      baseCv:      activeBaseCv.content_json || {},
      templateId:  doc.template_id  || 'classic',
      colorScheme: doc.color_scheme || 'colored',
      accentColor: doc.accent_color || '#2563EB',
      sections:    doc.sections_included || ['summary', 'skills', 'experience', 'education', 'certifications'],
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Document: refine with AI (creates new version) ────────────
router.post('/:id/documents/:docId/refine', requireAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const { refinementHints = '', discardEdits = false } = req.body;

    const docRes = await pool.query(
      'SELECT * FROM application_documents WHERE id = $1 AND application_id = $2',
      [docId, id]
    );
    if (!docRes.rows.length) return res.status(404).json({ error: 'Document not found' });
    const orig = docRes.rows[0];

    if (orig.is_manually_edited && !discardEdits) {
      return res.status(409).json({
        error: 'This version has manual edits. Refining creates a new version starting from the original AI draft — your edits here will not carry forward.',
        requiresConfirmation: true,
      });
    }

    const config      = orig.generation_config || {};
    const prevHints   = orig.generation_hints  || '';
    const mergedHints = [prevHints, refinementHints].filter(Boolean).join('\n\nRefinement: ');

    if (orig.document_type === 'CV') {
      const { generateCv } = require('../workers/cvWorker');
      const document = await generateCv(parseInt(id), {
        force:       true,
        language:    config.language    || 'en',
        sections:    (orig.sections_included && orig.sections_included.length ? orig.sections_included : config.sections) || ['summary', 'skills', 'experience', 'education', 'certifications'],
        userHints:   mergedHints,
        hintChips:   config.hintChips   || [],
        intensity:   config.intensity   || 'balanced',
        templateId:  orig.template_id   || config.templateId  || 'classic',
        colorScheme: orig.color_scheme  || config.colorScheme || 'colored',
        accentColor: orig.accent_color  || config.accentColor || '#2563EB',
      });
      return res.json(document);
    }

    if (orig.document_type === 'COVER_LETTER') {
      const coverLetterService = require('../services/cvGeneration/coverLetterService');
      const { document } = await coverLetterService.generate(parseInt(id), {
        language:           config.language    || 'en',
        tone:               config.tone        || 'professional',
        length:             config.length      || 'standard',
        format:             orig.template_id   || config.format   || 'modern',
        userHints:          mergedHints,
        accentColor:        orig.accent_color  || config.accentColor || '#2563EB',
        colorScheme:        orig.color_scheme  || config.colorScheme || 'colored',
        linkedCvDocumentId: config.linkedCvDocumentId || null,
      });
      return res.json(document);
    }

    res.status(400).json({ error: `Unsupported document type: ${orig.document_type}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Document: reformat (HTML only, returns live preview) ──────
router.post('/:id/documents/:docId/reformat', requireAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const {
      templateId  = 'classic',
      colorScheme = 'colored',
      accentColor = '#2563EB',
      fontFamily  = 'inter',
      fontSize    = '10.5pt',
      lineDensity = 'normal',
      sections,
    } = req.body;

    const docResult = await pool.query(
      'SELECT content_json, sections_included FROM application_documents WHERE id = $1 AND application_id = $2',
      [docId, id]
    );
    if (!docResult.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = docResult.rows[0];
    const aiOutput      = doc.content_json    || {};
    const effectiveSecs = sections || doc.sections_included || ['summary', 'skills', 'experience', 'education', 'certifications'];

    const baseCvService = require('../services/cvGeneration/baseCvService');
    const { buildCvHtml } = require('../services/cvGeneration/pdfService');

    const activeBaseCv = await baseCvService.getActiveBaseCv();
    const html = buildCvHtml({
      aiOutput,
      baseCv: activeBaseCv.content_json || {},
      templateId, colorScheme, accentColor, fontFamily, fontSize, lineDensity,
      sections: effectiveSecs,
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// ── Events: list + add manually ───────────────────────────────
router.get('/:id/events', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM application_events WHERE application_id = $1 ORDER BY event_date DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/events', requireAuth, async (req, res) => {
  try {
    const { event_type = 'NOTE', description, event_date } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'description is required' });
    const result = await pool.query(
      `INSERT INTO application_events (application_id, event_type, description, event_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, event_type, description.trim(), event_date || new Date()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Contacts ──────────────────────────────────────────────────
router.get('/:id/contacts', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM application_contacts WHERE application_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/contacts', requireAuth, async (req, res) => {
  try {
    const { name, title, email, linkedin_url, role = 'recruiter', notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const result = await pool.query(
      `INSERT INTO application_contacts (application_id, name, title, email, linkedin_url, role, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, name.trim(), title||null, email||null, linkedin_url||null, role, notes||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/contacts/:cid', requireAuth, async (req, res) => {
  try {
    const { name, title, email, linkedin_url, role, notes } = req.body;
    const result = await pool.query(
      `UPDATE application_contacts SET name=$1,title=$2,email=$3,linkedin_url=$4,role=$5,notes=$6
       WHERE id=$7 AND application_id=$8 RETURNING *`,
      [name, title||null, email||null, linkedin_url||null, role||'recruiter', notes||null, req.params.cid, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Contact not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/contacts/:cid', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM application_contacts WHERE id=$1 AND application_id=$2',
      [req.params.cid, req.params.id]
    );
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reminders ─────────────────────────────────────────────────
router.get('/:id/reminders', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM application_reminders WHERE application_id = $1 ORDER BY remind_at ASC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reminders', requireAuth, async (req, res) => {
  try {
    const { title, remind_at, reminder_type = 'custom' } = req.body;
    if (!title?.trim() || !remind_at) return res.status(400).json({ error: 'title and remind_at are required' });
    const result = await pool.query(
      `INSERT INTO application_reminders (application_id, title, remind_at, reminder_type)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, title.trim(), remind_at, reminder_type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/reminders/:rid', requireAuth, async (req, res) => {
  try {
    const { is_done, title, remind_at } = req.body;
    const result = await pool.query(
      `UPDATE application_reminders
       SET is_done  = COALESCE($1, is_done),
           title    = COALESCE($2, title),
           remind_at= COALESCE($3, remind_at)
       WHERE id=$4 AND application_id=$5 RETURNING *`,
      [is_done ?? null, title || null, remind_at || null, req.params.rid, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Reminder not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/reminders/:rid', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM application_reminders WHERE id=$1 AND application_id=$2',
      [req.params.rid, req.params.id]
    );
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Due reminders (dashboard widget) ─────────────────────────
router.get('/reminders/due', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, a.company_name, a.job_title, a.status AS app_status
       FROM application_reminders r
       JOIN applications a ON r.application_id = a.id
       WHERE r.is_done = false AND r.remind_at <= NOW() + INTERVAL '24 hours'
       ORDER BY r.remind_at ASC
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Generate CV + Cover Letter together (bundle) ──────────────
router.post('/:id/generate-bundle', requireAuth, async (req, res) => {
  try {
    const appId = parseInt(req.params.id);
    const {
      force       = false,
      language    = 'en',
      sections    = ['summary', 'skills', 'experience', 'education', 'certifications'],
      userHints   = '',
      hintChips   = [],
      intensity   = 'balanced',
      templateId  = 'classic',
      colorScheme = 'colored',
      accentColor = '#2563EB',
      fontFamily  = 'inter',
      fontSize    = '10.5pt',
      lineDensity = 'normal',
      tone               = 'professional',
      clLength           = 'standard',
      clFormat           = 'modern',
      generateCl         = true,
    } = req.body;

    const { generateCv }     = require('../workers/cvWorker');
    const coverLetterService = require('../services/cvGeneration/coverLetterService');

    // Generate CV first (cover letter can reference it)
    const cvDoc = await generateCv(appId, {
      force, language, sections, userHints, hintChips,
      intensity, templateId, colorScheme, accentColor, fontFamily, fontSize, lineDensity,
    });

    let clDoc = null;
    if (generateCl) {
      const clResult = await coverLetterService.generate(appId, {
        language, tone, length: clLength, format: clFormat,
        userHints, accentColor, colorScheme,
        linkedCvDocumentId: cvDoc.id,
      });
      clDoc = clResult.document;
    }

    res.json({ cv: cvDoc, cover_letter: clDoc });
  } catch (err) {
    console.error('[Applications:GenerateBundle]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Mark submitted document ───────────────────────────────────
router.patch('/:id/submitted-doc', requireAuth, async (req, res) => {
  try {
    const { doc_id } = req.body;
    const result = await pool.query(
      'UPDATE applications SET submitted_doc_id=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
      [doc_id || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Application not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Interview prep: update checklist item ────────────────────
router.patch('/:id/interview-prep', requireAuth, async (req, res) => {
  try {
    const { interview_prep } = req.body;
    const result = await pool.query(
      'UPDATE applications SET interview_prep=$1, updated_at=NOW() WHERE id=$2 RETURNING interview_prep',
      [JSON.stringify(interview_prep), req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Application not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics ─────────────────────────────────────────────────
router.get('/analytics/funnel', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        status,
        COUNT(*) AS count,
        ROUND(AVG(match_score::numeric),1) AS avg_score
      FROM applications
      GROUP BY status
      ORDER BY
        CASE status
          WHEN 'DRAFT'              THEN 1
          WHEN 'CV_GENERATED'       THEN 2
          WHEN 'READY_TO_APPLY'     THEN 3
          WHEN 'APPLIED'            THEN 4
          WHEN 'EMAIL_RECEIVED'     THEN 5
          WHEN 'HR_CONTACTED'       THEN 6
          WHEN 'INTERVIEW_INVITE'   THEN 7
          WHEN 'INTERVIEW_SCHEDULED'THEN 8
          WHEN 'TECHNICAL_TEST'     THEN 9
          WHEN 'FINAL_INTERVIEW'    THEN 10
          WHEN 'OFFER'              THEN 11
          WHEN 'NEGOTIATING'        THEN 12
          WHEN 'ACCEPTED'           THEN 13
          WHEN 'DECLINED_OFFER'     THEN 14
          WHEN 'REJECTED'           THEN 15
          WHEN 'NO_RESPONSE'        THEN 16
          WHEN 'WITHDRAWN'          THEN 17
          WHEN 'GHOSTED'            THEN 18
          WHEN 'ARCHIVED'           THEN 19
          ELSE 20
        END
    `);

    const byPlatform = await pool.query(`
      SELECT
        COALESCE(source_platform,'unknown') AS platform,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status NOT IN ('DRAFT','CV_GENERATED','ARCHIVED')) AS responded,
        ROUND(AVG(match_score::numeric),1) AS avg_score
      FROM applications
      GROUP BY source_platform
      ORDER BY total DESC
    `);

    const timings = await pool.query(`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (last_response_at - applied_at))/86400)::numeric,1) AS avg_days_to_response,
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/86400)::numeric,1) AS avg_age_days,
        COUNT(*) FILTER (WHERE applied_at IS NOT NULL) AS applied_count,
        COUNT(*) FILTER (WHERE last_response_at IS NOT NULL) AS response_count
      FROM applications
      WHERE applied_at IS NOT NULL
    `);

    res.json({
      by_status:   result.rows,
      by_platform: byPlatform.rows,
      timings:     timings.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CV template registry ──────────────────────────────────────
module.exports = router;
