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

module.exports = router;
