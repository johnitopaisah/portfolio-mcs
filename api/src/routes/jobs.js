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

// ── helpers ──────────────────────────────────────────────────
function safeSortField(sortBy) {
  const allowed = ['posted_at', 'relevance_score', 'title', 'company_name'];
  return allowed.includes(sortBy) ? sortBy : 'posted_at';
}

// ── GET /api/jobs ─────────────────────────────────────────────
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

    // ── Build WHERE clauses (shared between data and count queries) ──
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

    // ── Data query ─────────────────────────────────────────────
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

    // ── Count query — uses IDENTICAL conditions + params ───────
    const countQuery  = `SELECT COUNT(*) AS total FROM jobs WHERE ${where}`;

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params),    // ← same params, no hardcoded $2/$3/$4
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

// ── GET /api/jobs/stats (public summary) ──────────────────────
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

// ── GET /api/jobs/latest ──────────────────────────────────────
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

// ── GET /api/jobs/:id ─────────────────────────────────────────
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

// ── POST /api/jobs/:id/feedback (admin — record apply/skip) ──
// This is the feedback loop trigger: stores your decision on a job.
// Used by the admin UI "✓ Applied" and "✗ Skip" buttons.
router.post('/:id/feedback', requireAuth, async (req, res) => {
  try {
    const { decision, notes } = req.body; // decision: 'applied' | 'skip' | 'interested'
    if (!['applied', 'skip', 'interested'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision. Use: applied | skip | interested' });
    }

    await pool.query(
      `INSERT INTO job_feedback (job_id, decision, notes, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (job_id) DO UPDATE SET decision = $2, notes = $3, created_at = NOW()`,
      [req.params.id, decision, notes || null]
    );

    // Also update the job's ai_decision so it surfaces correctly in lists
    if (decision === 'skip') {
      await pool.query(
        `UPDATE jobs SET ai_decision = 'DROP', is_active = FALSE WHERE id = $1`,
        [req.params.id]
      );
    } else if (decision === 'applied') {
      await pool.query(
        `UPDATE jobs SET ai_decision = 'KEEP' WHERE id = $1`,
        [req.params.id]
      );
    }

    res.json({ ok: true, decision });
  } catch (err) {
    console.error('[Jobs:Feedback]', err.message);
    res.status(500).json({ error: 'Failed to record feedback' });
  }
});

// ── GET /api/jobs/feedback/summary (admin) ───────────────────
router.get('/feedback/summary', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        jf.decision,
        COUNT(*) AS count,
        -- Average score of jobs you chose to apply to vs skip
        ROUND(AVG(j.relevance_score)::numeric, 1) AS avg_score,
        -- Top tech stacks in jobs you applied to
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
