'use strict';
/**
 * Admin Job Targets Routes
 * CRUD for job_targets — the role+location pairs that drive the scraper's
 * search discovery (see scraper/src/pipeline.js). Each row is independently
 * pausable; discovery only ever searches for active targets.
 */

const express = require('express');
const pool    = require('../../db/client');
const { requireAuth } = require('../../middleware/auth');
const { queryJobsPaginated } = require('../../services/jobIngestion/jobsQuery');
const { applyTargetMatchConditions } = require('../../services/jobIngestion/targetMatching');
const config = require('../../services/jobIngestion/config');

const router = express.Router();

router.use(requireAuth);

/**
 * @swagger
 * /api/admin/targets:
 *   get:
 *     summary: List job targets
 *     description: >
 *       Returns every job_targets row plus best-effort discovery stats —
 *       boards_discovered and last_polled_at are derived from known_boards
 *       rows whose first_discovered_via matches this target's role_query
 *       (the same mapping scraper/src/pipeline.js uses at runtime).
 *     tags: [Admin: Job Targets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of targets
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.*,
        COALESCE(b.boards_discovered, 0)::int AS boards_discovered,
        b.last_polled_at
      FROM job_targets t
      LEFT JOIN (
        SELECT first_discovered_via, COUNT(*) AS boards_discovered, MAX(last_polled_at) AS last_polled_at
        FROM known_boards
        GROUP BY first_discovered_via
      ) b ON b.first_discovered_via = t.role_query
      ORDER BY t.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[Admin:Targets:List]', err.message);
    res.status(500).json({ error: 'Failed to fetch targets' });
  }
});

/**
 * @swagger
 * /api/admin/targets:
 *   post:
 *     summary: Create a job target
 *     tags: [Admin: Job Targets]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', async (req, res) => {
  try {
    const { role_query, locations, posted_within_days, min_score, notes } = req.body;
    if (!role_query?.trim()) return res.status(400).json({ error: 'role_query is required' });

    const { rows } = await pool.query(
      `INSERT INTO job_targets (role_query, locations, posted_within_days, min_score, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        role_query.trim(),
        Array.isArray(locations) ? locations : [],
        posted_within_days || null,
        min_score || null,
        notes || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Admin:Targets:Create]', err.message);
    res.status(500).json({ error: 'Failed to create target' });
  }
});

/**
 * @swagger
 * /api/admin/targets/{id}:
 *   put:
 *     summary: Update a job target (including pausing/resuming via is_active)
 *     tags: [Admin: Job Targets]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', async (req, res) => {
  try {
    const { role_query, locations, posted_within_days, min_score, notes, is_active } = req.body;
    if (!role_query?.trim()) return res.status(400).json({ error: 'role_query is required' });

    const { rows } = await pool.query(
      `UPDATE job_targets SET
         role_query = $2,
         locations = $3,
         posted_within_days = $4,
         min_score = $5,
         notes = $6,
         is_active = $7
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        role_query.trim(),
        Array.isArray(locations) ? locations : [],
        posted_within_days || null,
        min_score || null,
        notes || null,
        is_active !== false,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Target not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Admin:Targets:Update]', err.message);
    res.status(500).json({ error: 'Failed to update target' });
  }
});

/**
 * @swagger
 * /api/admin/targets/{id}:
 *   delete:
 *     summary: Delete a job target
 *     tags: [Admin: Job Targets]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM job_targets WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Target not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Admin:Targets:Delete]', err.message);
    res.status(500).json({ error: 'Failed to delete target' });
  }
});

/**
 * @swagger
 * /api/admin/targets/boards:
 *   get:
 *     summary: Discovery visibility — known_boards summary and recent list
 *     description: >
 *       Read-only view into the scraper's self-building board registry.
 *       Search discovers a board once; every subsequent run polls it
 *       directly, so this shows how much of the pipeline's cost is now
 *       "free" polling vs. active search discovery.
 *     tags: [Admin: Job Targets]
 *     security:
 *       - bearerAuth: []
 */
router.get('/boards', async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const [summaryRes, recentRes] = await Promise.all([
      pool.query(`
        SELECT ats_platform, COUNT(*)::int AS count,
               SUM(COALESCE(last_yield_count, 0))::int AS total_yield
        FROM known_boards
        GROUP BY ats_platform
        ORDER BY count DESC
      `),
      pool.query(
        `SELECT ats_platform, board_slug, first_discovered_via, last_polled_at, last_yield_count, created_at
         FROM known_boards
         ORDER BY created_at DESC
         LIMIT $1`,
        [parseInt(limit, 10)]
      ),
    ]);

    res.json({ summary: summaryRes.rows, recent: recentRes.rows });
  } catch (err) {
    console.error('[Admin:Targets:Boards]', err.message);
    res.status(500).json({ error: 'Failed to fetch known boards' });
  }
});

/**
 * @swagger
 * /api/admin/targets/{id}:
 *   get:
 *     summary: Fetch a single job target
 *     tags: [Admin: Job Targets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The target row
 *       404:
 *         description: Target not found
 */
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM job_targets WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Target not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[Admin:Targets:Get]', err.message);
    res.status(500).json({ error: 'Failed to fetch target' });
  }
});

/**
 * @swagger
 * /api/admin/targets/{id}/matches:
 *   get:
 *     summary: Jobs currently matching a target's criteria
 *     description: >
 *       There is no stored link between a job posting and the target that
 *       discovered it (a board is only ever discovered once, then polled
 *       directly forever after — see known_boards), so this is computed
 *       live: jobs.title is matched against the target's role_query via
 *       significant-keyword overlap, jobs.location against the target's
 *       locations (empty = no constraint; Remote jobs always pass regardless
 *       of the list), and posted_at against posted_within_days — all fixed
 *       identity criteria of the target. Score, sort, AI decision, and free
 *       text search are adjustable per-visit via query params.
 *     tags: [Admin: Job Targets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Free-text search over title + company name, ANDed with the target's own criteria
 *       - in: query
 *         name: minScore
 *         schema: { type: integer }
 *         description: Overrides the target's own min_score (or the global default) for this view only
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [score, date] }
 *       - in: query
 *         name: ai_decision
 *         schema: { type: string, enum: [KEEP, REVIEW, DROP] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated matching jobs
 *       404:
 *         description: Target not found
 */
router.get('/:id/matches', async (req, res) => {
  try {
    const { rows: targetRows } = await pool.query('SELECT * FROM job_targets WHERE id = $1', [req.params.id]);
    if (!targetRows.length) return res.status(404).json({ error: 'Target not found' });
    const target = targetRows[0];

    const { q, minScore, sort = 'score', ai_decision, page = 1, limit = 20 } = req.query;

    const conditions = ['j.is_active = TRUE'];
    const params = [];

    // Fixed identity criteria — title keywords, locations, recency.
    applyTargetMatchConditions(target, conditions, params);

    // Adjustable per-visit — score floor defaults to the target's own
    // override (or the global notification threshold), but can be moved
    // either direction via the page's own filter.
    const scoreFloor = minScore !== undefined ? parseInt(minScore, 10)
      : target.min_score ?? config.notifications.minRelevanceScore;
    params.push(scoreFloor);
    conditions.push(`j.relevance_score >= $${params.length}`);

    if (ai_decision) { params.push(ai_decision.toUpperCase()); conditions.push(`j.ai_decision = $${params.length}`); }

    if (q?.trim()) {
      params.push(`%${q.trim()}%`);
      const p1 = params.length;
      params.push(`%${q.trim()}%`);
      const p2 = params.length;
      conditions.push(`(j.title ILIKE $${p1} OR j.company_name ILIKE $${p2})`);
    }

    const result = await queryJobsPaginated({
      conditions, params, sort, page: parseInt(page, 10), limit: parseInt(limit, 10),
    });
    res.json({ target, ...result });
  } catch (err) {
    console.error('[Admin:Targets:Matches]', err.message);
    res.status(500).json({ error: 'Failed to fetch target matches' });
  }
});

module.exports = router;
