'use strict';
/**
 * Admin Job API Routes
 * Protected endpoints for managing job ingestion, filtering, monitoring,
 * and the feedback calibration system.
 */

const express       = require('express');
const pool          = require('../../db/client');
const { requireAuth } = require('../../middleware/auth');
const jobIngestionService = require('../../services/jobIngestion/jobIngestionService');
const { filterUnprocessedJobs, getFilteringStats, recalibrateFromFeedback }
  = require('../../services/jobIngestion/aiFilteringService');
const { sendDailyJobDigest, getAlertStats }
  = require('../../services/jobIngestion/notificationService');
const { getIngestionStats, getRecentLogs }
  = require('../../services/jobIngestion/ingestionLogsService');

const router = express.Router();

// All admin routes require auth — the JWT from admin-ui login
// requireAuth sets req.user; that's enough (only one admin user exists)
router.use(requireAuth);

// ── GET /api/admin/jobs/stats ────────────────────────────────
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

// ── GET /api/admin/jobs/logs ─────────────────────────────────
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

// ── GET /api/admin/jobs/ingestion-stats ──────────────────────
router.get('/ingestion-stats', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    res.json(await getIngestionStats(parseInt(hours, 10)));
  } catch (err) {
    console.error('[Admin:IngestionStats]', err.message);
    res.status(500).json({ error: 'Failed to fetch ingestion stats' });
  }
});

// ── POST /api/admin/jobs/ingest ──────────────────────────────
router.post('/ingest', async (req, res) => {
  jobIngestionService.ingestAllJobs().catch(err =>
    console.error('[Admin:Ingest] Background error:', err)
  );
  res.json({ message: 'Ingestion started in background', status: 'pending' });
});

// ── POST /api/admin/jobs/filter ──────────────────────────────
router.post('/filter', async (req, res) => {
  filterUnprocessedJobs().catch(err =>
    console.error('[Admin:Filter] Background error:', err)
  );
  res.json({ message: 'AI filtering started in background', status: 'pending' });
});

// ── POST /api/admin/jobs/send-alerts ─────────────────────────
router.post('/send-alerts', async (req, res) => {
  try {
    // Run inline (not background) so we can report what was sent
    const result = await sendDailyJobDigest();
    res.json({ message: 'Job digest sent', ...result });
  } catch (err) {
    console.error('[Admin:SendAlerts]', err.message);
    res.status(500).json({ error: 'Failed to send digest' });
  }
});

// ── POST /api/admin/jobs/calibrate ───────────────────────────
// Returns a calibration report based on your applied/skipped feedback.
// Called by the admin UI Calibration tab.
router.post('/calibrate', async (req, res) => {
  try {
    const report = await recalibrateFromFeedback();
    res.json(report);
  } catch (err) {
    console.error('[Admin:Calibrate]', err.message);
    res.status(500).json({ error: 'Calibration failed' });
  }
});

// ── GET /api/admin/jobs/raw ──────────────────────────────────
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

// ── GET /api/admin/jobs/pipeline/progress ────────────────────
// Must be registered before /:id routes
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

// ── GET /api/admin/jobs/pipeline ─────────────────────────────
router.get('/pipeline', async (req, res) => {
  try {
    const {
      tab = 'new', source, visa, sort = 'score', page = 1, limit = 20,
      seniority, min_score, location,
    } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const conditions = ['j.is_active = TRUE'];
    const params = [];

    if (tab === 'new') {
      conditions.push("j.ai_decision IN ('KEEP','REVIEW')");
      conditions.push("(jf.decision IS NULL OR jf.decision NOT IN ('applied','saved','interested'))");
    } else if (tab === 'saved') {
      conditions.push("jf.decision IN ('saved','interested')");
    } else if (tab === 'applied') {
      conditions.push("jf.decision = 'applied'");
    }

    if (source)    { params.push(source);                  conditions.push(`j.source_api = $${params.length}`); }
    if (visa === 'true')                                    conditions.push('j.visa_sponsored = TRUE');
    if (seniority) { params.push(seniority);               conditions.push(`j.seniority_level = $${params.length}`); }
    if (min_score) { params.push(parseInt(min_score, 10)); conditions.push(`j.relevance_score >= $${params.length}`); }
    if (location)  { params.push(`%${location}%`);         conditions.push(`j.location ILIKE $${params.length}`); }

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

// ── DELETE /api/admin/jobs/:id ───────────────────────────────
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

// ── PATCH /api/admin/jobs/:id ────────────────────────────────
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

// ── GET /api/admin/jobs/config ───────────────────────────────
router.get('/config', async (req, res) => {
  try {
    res.json({
      pollIntervalMinutes: process.env.JOB_POLL_INTERVAL_MINUTES || '15',
      aiEngine: process.env.ANTHROPIC_API_KEY
        ? 'claude-haiku-4-5 (Claude Haiku)'
        : process.env.GROQ_API_KEY
          ? 'groq/llama-3.3-70b (Groq)'
          : process.env.GEMINI_API_KEY
            ? 'gemini-2.0-flash (Gemini)'
            : 'pattern-v2 (no LLM key)',
      maxJobAgeDays:  14,
      digestTime:     '08:15 Europe/Paris',
      providers: {
        jooble:    !!process.env.JOOBLE_API_KEY,
        remoteOk:  true,
        adzuna:    !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_API_KEY),
        arbeitnow: true,
        remotive:  true,
        apec:      true,
        wttj:      !!(process.env.WTTJ_ALGOLIA_APP_ID && process.env.WTTJ_ALGOLIA_API_KEY),
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
