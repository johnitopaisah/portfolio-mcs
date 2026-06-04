'use strict';
/**
 * Job API Routes
 * Public endpoints for job discovery + admin management
 */

const express       = require('express');
const pool          = require('../db/client');
const { requireAuth } = require('../middleware/auth');
const rateLimit     = require('express-rate-limit');

const router = express.Router();

const jobLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

function safeSortField(sortBy) {
  const allowed = ['posted_at', 'relevance_score', 'title', 'company_name'];
  return allowed.includes(sortBy) ? sortBy : 'posted_at';
}

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: List AI-curated public job listings
 *     description: >
 *       Returns paginated active jobs that have not been dropped by the AI
 *       scorer. Supports full-text search, location/company/tech filtering,
 *       and a minimum relevance score threshold. Rate-limited to 100 requests
 *       per 15 minutes per IP.
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [relevance_score, posted_at, title, company_name], default: relevance_score }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [ASC, DESC], default: DESC }
 *       - in: query
 *         name: location
 *         schema: { type: string }
 *         description: Partial match on location (ILIKE)
 *       - in: query
 *         name: company
 *         schema: { type: string }
 *         description: Partial match on company name (ILIKE)
 *       - in: query
 *         name: tech
 *         schema: { type: string }
 *         description: Comma-separated list of tech stack keywords to match
 *       - in: query
 *         name: minScore
 *         schema: { type: integer, default: 0 }
 *         description: Minimum relevance score (0–100)
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search over title and description
 *     responses:
 *       200:
 *         description: Paginated job listings
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
 */
router.get('/', jobLimiter, async (req, res) => {
  try {
    const {
      page    = 1,
      limit   = 20,
      sortBy  = 'relevance_score',
      order   = 'DESC',
      location,
      company,
      tech,
      minScore = 0,
      search,
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const conditions = ['is_active = TRUE', 'relevance_score >= $1', "ai_decision != 'DROP'"];
    const params     = [parseInt(minScore, 10)];

    if (location) {
      params.push(`%${location}%`);
      conditions.push(`location ILIKE $${params.length}`);
    }
    if (company) {
      params.push(`%${company}%`);
      conditions.push(`company_name ILIKE $${params.length}`);
    }
    if (tech) {
      const techs = Array.isArray(tech) ? tech : tech.split(',');
      params.push(techs);
      conditions.push(`tech_stack && $${params.length}`);
    }
    if (search) {
      params.push(search);
      conditions.push(
        `to_tsvector('english', title || ' ' || description) @@ plainto_tsquery('english', $${params.length})`
      );
    }

    const where = conditions.join(' AND ');
    const sortCol   = safeSortField(sortBy);
    const sortDir   = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const dataParams = [...params, parseInt(limit, 10), offset];

    const dataQuery = `
      SELECT id, external_id, company_name, title, location, job_type,
             description, requirements, salary_min, salary_max, salary_currency,
             posted_at, apply_url, source_api, relevance_score, ai_decision,
             ai_reasoning, tech_stack, seniority_level, visa_sponsored,
             is_active, created_at
      FROM jobs
      WHERE ${where}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT $${dataParams.length - 1}
      OFFSET $${dataParams.length}
    `;

    const countQuery  = `SELECT COUNT(*) AS total FROM jobs WHERE ${where}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);

    res.json({
      data: dataResult.rows,
      pagination: {
        page:  parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error('[Jobs:List]', err.message);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

/**
 * @swagger
 * /api/jobs/stats:
 *   get:
 *     summary: Get public job statistics
 *     description: Returns aggregate counts and score statistics for the active job pool.
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: Job statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_jobs: { type: integer }
 *                 kept:       { type: integer, description: Jobs with KEEP decision }
 *                 review:     { type: integer, description: Jobs with REVIEW decision }
 *                 last_24h:   { type: integer, description: Jobs posted in last 24 hours }
 *                 avg_score:  { type: number }
 *                 top_score:  { type: integer }
 */
router.get('/stats', jobLimiter, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                                    AS total_jobs,
        COUNT(*) FILTER (WHERE ai_decision = 'KEEP')               AS kept,
        COUNT(*) FILTER (WHERE ai_decision = 'REVIEW')             AS review,
        COUNT(*) FILTER (WHERE posted_at > NOW() - INTERVAL '24h') AS last_24h,
        ROUND(AVG(relevance_score)::numeric, 1)                    AS avg_score,
        MAX(relevance_score)                                        AS top_score
      FROM jobs
      WHERE is_active = TRUE
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Jobs:Stats]', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * @swagger
 * /api/jobs/latest:
 *   get:
 *     summary: Get latest job listings
 *     description: Returns the most recently posted active jobs (excluding DROPs), newest first.
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Array of recent jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Job' }
 */
router.get('/latest', jobLimiter, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const result = await pool.query(
      `SELECT id, company_name, title, location, job_type, posted_at, apply_url,
              source_api, relevance_score, ai_decision, tech_stack, seniority_level, visa_sponsored
       FROM jobs
       WHERE is_active = TRUE AND ai_decision != 'DROP'
       ORDER BY posted_at DESC
       LIMIT $1`,
      [parseInt(limit, 10)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[Jobs:Latest]', err.message);
    res.status(500).json({ error: 'Failed to fetch latest jobs' });
  }
});

/**
 * @swagger
 * /api/jobs/{id}:
 *   get:
 *     summary: Get a single job
 *     description: Returns the full job record for an active job by ID.
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Job record
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Job' }
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.get('/:id', jobLimiter, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM jobs WHERE id = $1 AND is_active = TRUE',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Jobs:Detail]', err.message);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

/**
 * @swagger
 * /api/jobs/{id}/feedback:
 *   post:
 *     summary: Record feedback on a job (admin)
 *     description: >
 *       Records your apply/skip/save decision on a job. Accepts both
 *       `action` and `decision` body keys for backwards compatibility.
 *       Skipping or hiding a job also marks it inactive in the pipeline.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [applied, saved, skipped, skip, interested, hidden]
 *               decision:
 *                 type: string
 *                 description: Alias for `action` (legacy)
 *               notes:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Feedback recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:     { type: boolean }
 *                 action: { type: string }
 *       400:
 *         $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorised
 *       404:
 *         $ref: '#/components/schemas/Error'
 */
router.post('/:id/feedback', requireAuth, async (req, res) => {
  try {
    const raw = req.body.action || req.body.decision;
    const VALID = ['applied', 'saved', 'skipped', 'skip', 'interested', 'hidden'];
    if (!VALID.includes(raw)) {
      return res.status(400).json({ error: `Invalid action. Use: ${VALID.join(' | ')}` });
    }

    await pool.query(
      `INSERT INTO job_feedback (job_id, decision, note, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (job_id) DO UPDATE SET decision = $2, note = $3, created_at = NOW()`,
      [req.params.id, raw, req.body.notes || null]
    );

    if (raw === 'applied') {
      await pool.query(`UPDATE jobs SET ai_decision = 'KEEP' WHERE id = $1`, [req.params.id]);
    } else if (['skip', 'skipped', 'hidden'].includes(raw)) {
      await pool.query(
        `UPDATE jobs SET ai_decision = 'DROP', is_active = FALSE WHERE id = $1`,
        [req.params.id]
      );
    }

    res.json({ ok: true, action: raw });
  } catch (err) {
    console.error('[Jobs:Feedback]', err.message);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

/**
 * @swagger
 * /api/jobs/feedback/summary:
 *   get:
 *     summary: Get feedback summary statistics (admin)
 *     description: >
 *       Returns per-decision aggregate statistics — count, average relevance
 *       score, and top tech stacks — based on all recorded feedback. Useful
 *       for understanding your job preferences over time.
 *     tags: [Jobs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Feedback summary by decision
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   decision:  { type: string }
 *                   count:     { type: integer }
 *                   avg_score: { type: number }
 *                   top_tech:  { type: array, items: { type: string } }
 *       401:
 *         description: Unauthorised
 */
router.get('/feedback/summary', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        jf.decision,
        COUNT(*) AS count,
        ROUND(AVG(j.relevance_score)::numeric, 1) AS avg_score,
        ARRAY_AGG(DISTINCT t) FILTER (WHERE t IS NOT NULL) AS top_tech
      FROM job_feedback jf
      JOIN jobs j ON j.id = jf.job_id
      LEFT JOIN LATERAL UNNEST(j.tech_stack) AS t ON true
      GROUP BY jf.decision
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('[Jobs:FeedbackSummary]', err.message);
    res.status(500).json({ error: 'Failed to fetch feedback summary' });
  }
});

module.exports = router;
