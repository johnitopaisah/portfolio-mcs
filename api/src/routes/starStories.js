'use strict';

const express         = require('express');
const pool            = require('../db/client');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/star-stories
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM star_stories ORDER BY updated_at DESC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/star-stories
router.post('/', requireAuth, async (req, res, next) => {
  const { title, situation, task, action, result, themes } = req.body;
  if (!situation || !task || !action || !result) {
    return res.status(400).json({ error: 'situation, task, action, result are required' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO star_stories (title, situation, task, action, result, themes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title || null, situation, task, action, result, themes || []]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/star-stories/:id
router.put('/:id', requireAuth, async (req, res, next) => {
  const { title, situation, task, action, result, themes } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE star_stories
       SET title=$1, situation=$2, task=$3, action=$4, result=$5,
           themes=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [title || null, situation, task, action, result, themes || [], req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/star-stories/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM star_stories WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/star-stories/for-application/:appId
// Returns stories with usage count for this application's interview questions
router.get('/for-application/:appId', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT s.*,
        COUNT(iq.id)::int AS usage_count
      FROM star_stories s
      LEFT JOIN interview_questions iq
        ON iq.star_story_id = s.id AND iq.application_id = $1
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `, [req.params.appId]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
