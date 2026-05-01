/**
 * Job API Routes
 * Public and admin endpoints for job discovery, recommendations, and management
 */

const express = require('express');
const pool = require('../db/client');
const { authenticateToken } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for job endpoints (higher than default)
const jobLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests to job endpoints',
});

// ============================================================
//  PUBLIC ENDPOINTS (No auth required)
// ============================================================

/**
 * GET /api/jobs
 * Get paginated list of active jobs with filters
 */
router.get('/', jobLimiter, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'posted_at',
      order = 'DESC',
      location,
      company,
      tech,
      minScore = 0,
      search,
    } = req.query;

    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM jobs WHERE is_active = TRUE AND relevance_score >= $1';
    const params = [minScore];
    let paramCount = 1;

    // Filters
    if (location) {
      paramCount++;
      query += ` AND location ILIKE $${paramCount}`;
      params.push(`%${location}%`);
    }

    if (company) {
      paramCount++;
      query += ` AND company_name ILIKE $${paramCount}`;
      params.push(`%${company}%`);
    }

    if (tech) {
      paramCount++;
      const techs = Array.isArray(tech) ? tech : [tech];
      query += ` AND tech_stack && $${paramCount}`;
      params.push(techs);
    }

    if (search) {
      paramCount++;
      query += ` AND to_tsvector('english', title || ' ' || description) @@ plainto_tsquery('english', $${paramCount})`;
      params.push(search);
    }

    // Sorting
    const allowedSortFields = ['posted_at', 'relevance_score', 'title', 'company_name'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'posted_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortField} ${sortOrder}`;

    // Pagination
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM jobs WHERE is_active = TRUE AND relevance_score >= $1';
    const countParams = [minScore];
    if (location) countQuery += ` AND location ILIKE $2`, countParams.push(`%${location}%`);
    if (company) countQuery += ` AND company_name ILIKE $3`, countParams.push(`%${company}%`);
    if (tech) countQuery += ` AND tech_stack && $4`, countParams.push(Array.isArray(tech) ? tech : [tech]);

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total, 10);

    res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[Jobs:List] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

/**
 * GET /api/jobs/latest
 * Get most recently posted jobs
 */
router.get('/latest', jobLimiter, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const query = `
      SELECT * FROM jobs
      WHERE is_active = TRUE
      ORDER BY posted_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    res.json(result.rows);
  } catch (error) {
    console.error('[Jobs:Latest] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch latest jobs' });
  }
});

/**
 * GET /api/jobs/:id
 * Get a single job by ID
 */
router.get('/:id', jobLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    const query = 'SELECT * FROM jobs WHERE id = $1 AND is_active = TRUE';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Jobs:Detail] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

/**
 * GET /api/jobs/recommendations
 * Get personalized job recommendations (requires user preferences)
 */
router.get('/recommendations', authenticateToken, jobLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 10 } = req.query;

    // Get user preferences
    const prefResult = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId]
    );

    if (prefResult.rows.length === 0) {
      return res.status(404).json({ error: 'User preferences not found' });
    }

    const pref = prefResult.rows[0];

    // Build personalized query
    let query = `
      SELECT j.*, 
             COALESCE(ujs.id IS NOT NULL, FALSE) as is_saved
      FROM jobs j
      LEFT JOIN user_saved_jobs ujs ON j.id = ujs.job_id AND ujs.user_id = $1
      WHERE j.is_active = TRUE
        AND j.relevance_score >= $2
    `;

    const params = [userId, pref.min_relevance_score || 70];

    // Apply user preferences
    if (pref.desired_roles && pref.desired_roles.length > 0) {
      query += ` AND (${pref.desired_roles
        .map((_, i) => `j.title ILIKE $${params.length + i + 3}`)
        .join(' OR ')})`;
      params.push(...pref.desired_roles.map((r) => `%${r}%`));
    }

    if (pref.desired_locations && pref.desired_locations.length > 0) {
      query += ` AND (${pref.desired_locations
        .map((_, i) => `j.location ILIKE $${params.length + i + 3}`)
        .join(' OR ')})`;
      params.push(...pref.desired_locations.map((l) => `%${l}%`));
    }

    if (pref.required_tech_stack && pref.required_tech_stack.length > 0) {
      query += ` AND j.tech_stack && $${params.length + 3}`;
      params.push(pref.required_tech_stack);
    }

    query += ` ORDER BY j.relevance_score DESC, j.posted_at DESC LIMIT $${params.length + 3}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('[Jobs:Recommendations] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// ============================================================
//  USER PREFERENCES ENDPOINTS
// ============================================================

/**
 * GET /api/jobs/user-preferences
 * Get user's job preferences
 */
router.get('/user-preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Preferences not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[Preferences:Get] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * POST /api/jobs/user-preferences
 * Create or update user preferences
 */
router.post('/user-preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      desired_roles,
      desired_locations,
      min_salary,
      required_tech_stack,
      avoid_tech_stack,
      preferred_seniority,
      visa_requirement,
      min_relevance_score,
      alert_email,
      telegram_chat_id,
      slack_webhook_url,
    } = req.body;

    const query = `
      INSERT INTO user_preferences (
        user_id,
        desired_roles,
        desired_locations,
        min_salary,
        required_tech_stack,
        avoid_tech_stack,
        preferred_seniority,
        visa_requirement,
        min_relevance_score,
        alert_email,
        telegram_chat_id,
        slack_webhook_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id) DO UPDATE SET
        desired_roles = $2,
        desired_locations = $3,
        min_salary = $4,
        required_tech_stack = $5,
        avoid_tech_stack = $6,
        preferred_seniority = $7,
        visa_requirement = $8,
        min_relevance_score = $9,
        alert_email = $10,
        telegram_chat_id = $11,
        slack_webhook_url = $12
      RETURNING *;
    `;

    const result = await pool.query(query, [
      userId,
      desired_roles || [],
      desired_locations || [],
      min_salary,
      required_tech_stack || [],
      avoid_tech_stack || [],
      preferred_seniority || [],
      visa_requirement,
      min_relevance_score || 70,
      alert_email,
      telegram_chat_id,
      slack_webhook_url,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[Preferences:Create] Error:', error.message);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
});

// ============================================================
//  SAVED JOBS ENDPOINTS
// ============================================================

/**
 * GET /api/jobs/saved
 * Get user's saved jobs
 */
router.get('/saved', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT j.* FROM jobs j
      JOIN user_saved_jobs usj ON j.id = usj.job_id
      WHERE usj.user_id = $1
      ORDER BY usj.saved_at DESC
    `;

    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error('[SavedJobs:List] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch saved jobs' });
  }
});

/**
 * POST /api/jobs/:id/save
 * Save a job
 */
router.post('/:id/save', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const jobId = req.params.id;
    const { notes } = req.body;

    const query = `
      INSERT INTO user_saved_jobs (user_id, job_id, notes)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, job_id) DO UPDATE SET notes = $3
      RETURNING *;
    `;

    const result = await pool.query(query, [userId, jobId, notes]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[SavedJobs:Save] Error:', error.message);
    res.status(500).json({ error: 'Failed to save job' });
  }
});

/**
 * DELETE /api/jobs/:id/save
 * Unsave a job
 */
router.delete('/:id/save', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const jobId = req.params.id;

    const query = 'DELETE FROM user_saved_jobs WHERE user_id = $1 AND job_id = $2';
    await pool.query(query, [userId, jobId]);

    res.json({ message: 'Job unsaved' });
  } catch (error) {
    console.error('[SavedJobs:Delete] Error:', error.message);
    res.status(500).json({ error: 'Failed to unsave job' });
  }
});

module.exports = router;
