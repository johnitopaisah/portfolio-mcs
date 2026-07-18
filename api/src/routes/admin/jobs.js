'use strict';
/**
 * Admin Job API Routes
 * Protected endpoints for managing job ingestion, filtering, monitoring,
 * and the feedback calibration system.
 */

const express       = require('express');
const pool          = require('../../db/client');
const { requireAuth } = require('../../middleware/auth');
const { filterUnprocessedJobs, getFilteringStats, recalibrateFromFeedback }
  = require('../../services/jobIngestion/aiFilteringService');
const { sendDailyJobDigest, getAlertStats }
  = require('../../services/jobIngestion/notificationService');
const { getIngestionStats, getRecentLogs }
  = require('../../services/jobIngestion/ingestionLogsService');

const router = express.Router();

router.use(requireAuth);

/**
 * @swagger
 * /api/admin/jobs/stats:
 *   get:
 *     summary: Get job pipeline statistics
 *     description: Returns aggregate job counts, average relevance score, AI filtering stats, and alert stats for the given time window.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema: { type: integer, default: 24 }
 *         description: Look-back window in hours
 *     responses:
 *       200:
 *         description: Pipeline statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 jobs:
 *                   type: object
 *                   properties:
 *                     total_jobs:     { type: integer }
 *                     active_jobs:    { type: integer }
 *                     avg_relevance:  { type: number }
 *                     jobs_this_week: { type: integer }
 *                 filtering: { type: object }
 *                 alerts:    { type: object }
 *       401:
 *         description: Unauthorised
 */
router.get('/stats', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const [jobsRes, filterStats, alertStats] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                           AS total_jobs,
          COUNT(*) FILTER (WHERE is_active = TRUE)          AS active_jobs,
          ROUND(AVG(relevance_score)::numeric, 1)           AS avg_relevance,
          COUNT(*) FILTER (WHERE posted_at > NOW() - INTERVAL '7 days') AS jobs_this_week
        FROM jobs
      `),
      getFilteringStats(parseInt(hours, 10)),
      getAlertStats(parseInt(hours, 10)),
    ]);
    res.json({ jobs: jobsRes.rows[0], filtering: filterStats, alerts: alertStats });
  } catch (err) {
    console.error('[Admin:Stats]', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/logs:
 *   get:
 *     summary: Get ingestion run logs
 *     description: Returns paginated ingestion run logs ordered by most recent first.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Paginated log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { type: object }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:  { type: integer }
 *                     offset: { type: integer }
 *                     total:  { type: integer }
 *       401:
 *         description: Unauthorised
 */
router.get('/logs', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const logs = await getRecentLogs(parseInt(limit, 10), parseInt(offset, 10));
    const countRes = await pool.query('SELECT COUNT(*) AS total FROM job_ingestion_logs');
    res.json({
      data: logs,
      pagination: { limit: parseInt(limit, 10), offset: parseInt(offset, 10), total: parseInt(countRes.rows[0].total, 10) },
    });
  } catch (err) {
    console.error('[Admin:Logs]', err.message);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/sources-status:
 *   get:
 *     summary: Get job source health status
 *     description: >
 *       Returns the health status of each career-site discovery source
 *       (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, LinkedIn lead
 *       capture, custom-site Claude extraction) including whether required
 *       API keys are set and the outcome of the most recent scraper run for
 *       that source.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of source status objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   source:      { type: string, example: greenhouse_search }
 *                   label:       { type: string, example: Greenhouse }
 *                   keyRequired: { type: boolean }
 *                   keySet:      { type: boolean, nullable: true }
 *                   missingKeys: { type: array, items: { type: string }, nullable: true }
 *                   status:
 *                     type: string
 *                     enum: [active, pending, error, issue, not_set]
 *                   lastRun:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       status:       { type: string }
 *                       jobsFetched:  { type: integer }
 *                       jobsNew:      { type: integer }
 *                       errorMessage: { type: string, nullable: true }
 *                       runAt:        { type: string, format: date-time }
 *       401:
 *         description: Unauthorised
 */
const JOB_SOURCES = [
  { key: 'greenhouse_search',      label: 'Greenhouse',              envs: [] },
  { key: 'lever_search',           label: 'Lever',                    envs: [] },
  { key: 'ashby_search',           label: 'Ashby',                    envs: [] },
  { key: 'workday_search',         label: 'Workday',                  envs: [] },
  { key: 'smartrecruiters_search', label: 'SmartRecruiters',          envs: [] },
  { key: 'linkedin_search',        label: 'LinkedIn (lead capture)',  envs: [] },
  { key: 'custom_site_search',     label: 'Custom Site (Claude)',     envs: ['ANTHROPIC_API_KEY'] },
];

router.get('/sources-status', async (req, res) => {
  try {
    const logsRes = await pool.query(`
      SELECT DISTINCT ON (source_api)
        source_api, status, jobs_fetched, jobs_new, error_message, created_at
      FROM job_ingestion_logs
      ORDER BY source_api, created_at DESC
    `);

    const lastRun = {};
    logsRes.rows.forEach(r => { lastRun[r.source_api] = r; });

    const data = JOB_SOURCES.map(s => {
      const keyRequired = s.envs.length > 0;
      const missingKeys = s.envs.filter(k => !process.env[k]);
      const keySet      = missingKeys.length === 0;
      const last        = lastRun[s.key] || null;

      let status;
      if (keyRequired && !keySet) {
        status = 'not_set';
      } else if (!last) {
        status = 'pending';
      } else if (last.status === 'FAILED') {
        status = 'error';
      } else if (last.jobs_fetched === 0) {
        status = 'issue';
      } else {
        status = 'active';
      }

      return {
        source:      s.key,
        label:       s.label,
        keyRequired,
        keySet:      keyRequired ? keySet : null,
        missingKeys: missingKeys.length ? missingKeys : null,
        status,
        lastRun: last ? {
          status:       last.status,
          jobsFetched:  last.jobs_fetched,
          jobsNew:      last.jobs_new,
          errorMessage: last.error_message,
          runAt:        last.created_at,
        } : null,
      };
    });

    res.json(data);
  } catch (err) {
    console.error('[Admin:SourcesStatus]', err.message);
    res.status(500).json({ error: 'Failed to fetch sources status' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/ingestion-stats:
 *   get:
 *     summary: Get detailed ingestion statistics
 *     description: Returns per-source ingestion metrics for the given look-back window.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema: { type: integer, default: 24 }
 *         description: Look-back window in hours
 *     responses:
 *       200:
 *         description: Ingestion statistics object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorised
 */
router.get('/ingestion-stats', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    res.json(await getIngestionStats(parseInt(hours, 10)));
  } catch (err) {
    console.error('[Admin:IngestionStats]', err.message);
    res.status(500).json({ error: 'Failed to fetch ingestion stats' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/filter:
 *   post:
 *     summary: Trigger AI filtering pass
 *     description: >
 *       Runs the AI scoring/filtering pass over all unprocessed jobs in the
 *       background. Returns immediately with `status: pending`.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Filtering started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: AI filtering started in background }
 *                 status:  { type: string, example: pending }
 *       401:
 *         description: Unauthorised
 */
router.post('/filter', async (req, res) => {
  filterUnprocessedJobs().catch(err =>
    console.error('[Admin:Filter] Background error:', err)
  );
  res.json({ message: 'AI filtering started in background', status: 'pending' });
});

/**
 * @swagger
 * /api/admin/jobs/send-alerts:
 *   post:
 *     summary: Send job digest notification
 *     description: >
 *       Runs the daily job digest inline (not in background) and returns a
 *       summary of what was sent. Useful for manual testing of notifications.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Digest sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: Job digest sent }
 *       401:
 *         description: Unauthorised
 */
router.post('/send-alerts', async (req, res) => {
  try {
    const result = await sendDailyJobDigest();
    res.json({ message: 'Job digest sent', ...result });
  } catch (err) {
    console.error('[Admin:SendAlerts]', err.message);
    res.status(500).json({ error: 'Failed to send digest' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/calibrate:
 *   post:
 *     summary: Generate calibration report from feedback
 *     description: >
 *       Analyses your applied/skipped feedback history to produce threshold
 *       recommendations. Does not modify any settings automatically.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Calibration report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Calibration report with recommended threshold adjustments
 *       401:
 *         description: Unauthorised
 */
router.post('/calibrate', async (req, res) => {
  try {
    const report = await recalibrateFromFeedback();
    res.json(report);
  } catch (err) {
    console.error('[Admin:Calibrate]', err.message);
    res.status(500).json({ error: 'Calibration failed' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/raw:
 *   get:
 *     summary: Browse raw (pre-dedup) job records
 *     description: Returns paginated raw job records that passed deduplication.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Paginated raw job records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { type: object }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:  { type: integer }
 *                     offset: { type: integer }
 *                     total:  { type: integer }
 *       401:
 *         description: Unauthorised
 */
router.get('/raw', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const [data, count] = await Promise.all([
      pool.query(
        'SELECT * FROM jobs_raw WHERE is_duplicate = FALSE ORDER BY posted_at DESC LIMIT $1 OFFSET $2',
        [parseInt(limit, 10), parseInt(offset, 10)]
      ),
      pool.query('SELECT COUNT(*) AS total FROM jobs_raw WHERE is_duplicate = FALSE'),
    ]);
    res.json({
      data: data.rows,
      pagination: { limit: parseInt(limit, 10), offset: parseInt(offset, 10), total: parseInt(count.rows[0].total, 10) },
    });
  } catch (err) {
    console.error('[Admin:RawJobs]', err.message);
    res.status(500).json({ error: 'Failed to fetch raw jobs' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/pipeline/progress:
 *   get:
 *     summary: Get pipeline progress counters
 *     description: >
 *       Returns aggregate counters for the admin pipeline dashboard — total
 *       pipeline size, new/saved/applied/reviewed counts, jobs added today,
 *       applications this week, and average relevance score.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pipeline progress counters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_pipeline:    { type: integer }
 *                 new_count:         { type: integer }
 *                 saved_count:       { type: integer }
 *                 applied_count:     { type: integer }
 *                 reviewed_count:    { type: integer }
 *                 added_today:       { type: integer }
 *                 applied_this_week: { type: integer }
 *                 avg_score:         { type: number }
 *       401:
 *         description: Unauthorised
 */
router.get('/pipeline/progress', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE j.is_active = TRUE AND j.ai_decision IN ('KEEP','REVIEW'))
          AS total_pipeline,
        COUNT(*) FILTER (WHERE j.is_active = TRUE AND j.ai_decision IN ('KEEP','REVIEW')
          AND (jf.decision IS NULL OR jf.decision NOT IN ('applied','saved','interested')))
          AS new_count,
        COUNT(*) FILTER (WHERE jf.decision IN ('saved','interested') AND j.is_active = TRUE)
          AS saved_count,
        COUNT(*) FILTER (WHERE jf.decision = 'applied')
          AS applied_count,
        COUNT(*) FILTER (WHERE j.is_active = TRUE AND j.ai_decision IN ('KEEP','REVIEW')
          AND jf.decision IN ('saved','applied','interested'))
          AS reviewed_count,
        COUNT(*) FILTER (WHERE j.posted_at > NOW() - INTERVAL '24h'
          AND j.is_active = TRUE AND j.ai_decision IN ('KEEP','REVIEW'))
          AS added_today,
        COUNT(*) FILTER (WHERE jf.decision = 'applied'
          AND jf.created_at > NOW() - INTERVAL '7 days')
          AS applied_this_week,
        ROUND(AVG(j.relevance_score) FILTER (
          WHERE j.is_active = TRUE AND j.ai_decision IN ('KEEP','REVIEW'))::numeric, 1)
          AS avg_score
      FROM jobs j
      LEFT JOIN job_feedback jf ON jf.job_id = j.id
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Admin:PipelineProgress]', err.message);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/pipeline:
 *   get:
 *     summary: Browse the job pipeline
 *     description: >
 *       Returns paginated jobs in the pipeline with filtering, sorting, and
 *       tab-based views. The `tab` parameter selects between new/saved/applied
 *       views. All filter parameters are optional and combinable.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tab
 *         schema: { type: string, enum: [new, saved, applied], default: new }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [score, date], default: score }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: source
 *         schema: { type: string }
 *         description: Filter by source API key (e.g. joobleApi)
 *       - in: query
 *         name: visa
 *         schema: { type: string, enum: ['true'] }
 *         description: Set to "true" to show only visa-sponsored roles
 *       - in: query
 *         name: seniority
 *         schema: { type: string }
 *         description: Filter by seniority level (e.g. Senior, Mid, Junior)
 *       - in: query
 *         name: min_score
 *         schema: { type: integer }
 *         description: Minimum relevance score
 *       - in: query
 *         name: location
 *         schema: { type: string }
 *         description: Partial location match (ILIKE)
 *       - in: query
 *         name: ai_decision
 *         schema: { type: string, enum: [KEEP, REVIEW, DROP] }
 *         description: Filter by AI decision
 *     responses:
 *       200:
 *         description: Paginated pipeline jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Job' }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:  { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *                     pages: { type: integer }
 *       401:
 *         description: Unauthorised
 */
router.get('/pipeline', async (req, res) => {
  try {
    const {
      tab = 'new', source, visa, sort = 'score', page = 1, limit = 20,
      seniority, min_score, location, ai_decision,
    } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const conditions = ['j.is_active = TRUE'];
    const params = [];

    if (tab === 'new') {
      if (!ai_decision) conditions.push("j.ai_decision IN ('KEEP','REVIEW')");
      conditions.push("(jf.decision IS NULL OR jf.decision NOT IN ('applied','saved','interested'))");
    } else if (tab === 'saved') {
      conditions.push("jf.decision IN ('saved','interested')");
    } else if (tab === 'applied') {
      conditions.push("jf.decision = 'applied'");
    }

    if (source)      { params.push(source);                  conditions.push(`j.source_api = $${params.length}`); }
    if (visa === 'true')                                      conditions.push('j.visa_sponsored = TRUE');
    if (seniority)   { params.push(seniority);               conditions.push(`j.seniority_level = $${params.length}`); }
    if (min_score)   { params.push(parseInt(min_score, 10)); conditions.push(`j.relevance_score >= $${params.length}`); }
    if (location)    { params.push(`%${location}%`);         conditions.push(`j.location ILIKE $${params.length}`); }
    if (ai_decision) { params.push(ai_decision.toUpperCase()); conditions.push(`j.ai_decision = $${params.length}`); }

    const where = conditions.join(' AND ');
    const sortExpr = sort === 'date' ? 'j.posted_at DESC' : 'j.relevance_score DESC';

    const dataQ = `
      SELECT j.id, j.company_name, j.title, j.location, j.job_type,
             j.description, j.requirements, j.apply_url, j.source_api,
             j.relevance_score, j.ai_decision, j.ai_reasoning,
             j.tech_stack, j.seniority_level, j.visa_sponsored,
             j.salary_min, j.salary_max, j.salary_currency,
             j.posted_at, j.created_at,
             jf.decision AS user_decision, jf.created_at AS feedback_at
      FROM jobs j
      LEFT JOIN job_feedback jf ON jf.job_id = j.id
      WHERE ${where}
      ORDER BY ${sortExpr}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const countQ = `
      SELECT COUNT(*) AS total
      FROM jobs j
      LEFT JOIN job_feedback jf ON jf.job_id = j.id
      WHERE ${where}
    `;

    const [data, count] = await Promise.all([
      pool.query(dataQ, [...params, parseInt(limit, 10), offset]),
      pool.query(countQ, params),
    ]);

    res.json({
      data: data.rows,
      pagination: {
        page:  parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: parseInt(count.rows[0].total, 10),
        pages: Math.ceil(count.rows[0].total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error('[Admin:Pipeline]', err.message);
    res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/{id}:
 *   delete:
 *     summary: Deactivate a job
 *     description: Soft-deletes a job by setting `is_active = false` and `expires_at = NOW()`.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Job deactivated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: Job deactivated }
 *                 id:      { type: string, format: uuid }
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE jobs SET is_active = FALSE, expires_at = NOW() WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json({ message: 'Job deactivated', id: result.rows[0].id });
  } catch (err) {
    console.error('[Admin:Delete]', err.message);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/{id}:
 *   patch:
 *     summary: Override AI scoring fields on a job
 *     description: >
 *       Allows manual override of `relevance_score`, `ai_decision`, or
 *       `ai_reasoning` on a specific job. Only fields provided in the body
 *       are updated.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               relevance_score: { type: integer, minimum: 0, maximum: 100 }
 *               ai_decision:     { type: string, enum: [KEEP, REVIEW, DROP] }
 *               ai_reasoning:    { type: string }
 *     responses:
 *       200:
 *         description: Updated job record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Job'
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.patch('/:id', async (req, res) => {
  try {
    const { relevance_score, ai_decision, ai_reasoning } = req.body;
    const sets = []; const params = [];
    if (relevance_score !== undefined) { params.push(relevance_score); sets.push(`relevance_score = $${params.length}`); }
    if (ai_decision)                   { params.push(ai_decision);     sets.push(`ai_decision = $${params.length}`); }
    if (ai_reasoning)                  { params.push(ai_reasoning);    sets.push(`ai_reasoning = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE jobs SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Admin:Patch]', err.message);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

/**
 * @swagger
 * /api/admin/jobs/config:
 *   get:
 *     summary: Get pipeline runtime configuration
 *     description: >
 *       Returns read-only runtime configuration — active AI engine name,
 *       discovery schedule, max job age, digest schedule, and which
 *       discovery sources and integrations have API keys configured.
 *     tags: [Admin: Job Pipeline]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Runtime configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 discoverySchedule: { type: string }
 *                 aiEngine:          { type: string }
 *                 maxJobAgeDays:     { type: integer }
 *                 digestTime:        { type: string, example: '08:15 Europe/Paris' }
 *                 sources:
 *                   type: object
 *                   additionalProperties: { type: boolean }
 *                 integrations:
 *                   type: object
 *                   additionalProperties: { type: boolean }
 *       401:
 *         description: Unauthorised
 */
router.get('/config', async (req, res) => {
  try {
    res.json({
      discoverySchedule: 'daily 03:00 (scraper-discovery CronJob)',
      aiEngine: process.env.ANTHROPIC_API_KEY
        ? 'claude-haiku-4-5 (Claude Haiku)'
        : process.env.GROQ_API_KEY
          ? 'groq/llama-3.3-70b (Groq)'
          : process.env.GEMINI_API_KEY
            ? 'gemini-2.0-flash (Gemini)'
            : 'pattern-v2 (no LLM key)',
      maxJobAgeDays:  14,
      digestTime:     '08:15 Europe/Paris',
      sources: {
        greenhouse:      true,
        lever:           true,
        ashby:           true,
        workday:         true,
        smartrecruiters: true,
        linkedin:        true,
        customSite:      !!process.env.ANTHROPIC_API_KEY,
      },
      integrations: {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        groq:      !!process.env.GROQ_API_KEY,
        gemini:    !!process.env.GEMINI_API_KEY,
        zohoSmtp:  !!process.env.NOTIFY_EMAIL_USER,
        telegram:  !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      },
    });
  } catch (err) {
    console.error('[Admin:Config]', err.message);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

module.exports = router;
